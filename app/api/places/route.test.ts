import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function req(params: Record<string, string>, ip = `127.0.0.${Math.floor(Math.random() * 250) + 1}`) {
  const url = new URL("http://localhost/api/places");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

describe("/api/places", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("returns demo (echo) places with no API key configured", async () => {
    const { GET } = await import("./route");
    const res = await GET(req({ lat: "-1.28", lon: "36.8", category: "cafes" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("echo");
    expect(body.places.length).toBeGreaterThan(0);
    expect(body.places[0].source).toBe("echo");
  });

  it("rejects out-of-range coordinates", async () => {
    const { GET } = await import("./route");
    const res = await GET(req({ lat: "999", lon: "36.8", category: "cafes" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown category", async () => {
    const { GET } = await import("./route");
    const res = await GET(req({ lat: "-1.28", lon: "36.8", category: "not-a-real-category" }));
    expect(res.status).toBe(400);
  });

  it("rate-limits a single IP after the per-minute budget", async () => {
    const { GET } = await import("./route");
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 61; i++) {
      const res = await GET(req({ lat: "-1.28", lon: "36.8", category: "cafes" }, ip));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
