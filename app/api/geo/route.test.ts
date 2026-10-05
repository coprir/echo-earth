import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

function req(headers: Record<string, string>) {
  return new NextRequest(new URL("http://localhost/api/geo"), { headers });
}

describe("/api/geo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses edge/proxy headers when present, without any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("./route");
    const res = await GET(
      req({
        "x-vercel-ip-latitude": "51.5",
        "x-vercel-ip-longitude": "-0.12",
        "x-vercel-ip-city": "London",
        "x-vercel-ip-country": "GB",
        "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      })
    );
    const body = await res.json();
    expect(body).toMatchObject({ lat: 51.5, lon: -0.12, city: "London", country: "GB", source: "edge-header" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the hardcoded default when the IP lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 }))
    );
    const { GET } = await import("./route");
    const res = await GET(req({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` }));
    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(body.city).toBe("Nairobi");
  });

  it("uses the IP-lookup result when it succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ latitude: 48.85, longitude: 2.35, city: "Paris", country_code: "FR" }), {
          status: 200,
        })
      )
    );
    const { GET } = await import("./route");
    const res = await GET(req({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` }));
    const body = await res.json();
    expect(body).toMatchObject({ lat: 48.85, lon: 2.35, city: "Paris", country: "FR", source: "ip" });
  });

  it("rate-limits a single IP after the per-minute budget", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const { GET } = await import("./route");
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 61; i++) {
      const res = await GET(req({ "x-forwarded-for": ip }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
