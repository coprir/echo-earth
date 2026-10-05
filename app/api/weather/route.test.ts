import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function req(params: Record<string, string>, ip = `127.0.0.${Math.floor(Math.random() * 250) + 1}`) {
  const url = new URL("http://localhost/api/weather");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

describe("/api/weather", () => {
  beforeEach(() => {
    delete process.env.OPENWEATHER_API_KEY;
  });

  it("returns synthesized (echo) weather with no API key configured", async () => {
    const { GET } = await import("./route");
    const res = await GET(req({ lat: "-1.28", lon: "36.8" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("echo");
    expect(typeof body.tempC).toBe("number");
  });

  it("is deterministic for the same lat on the same day", async () => {
    const { GET } = await import("./route");
    const a = await (await GET(req({ lat: "40.7", lon: "-74" }))).json();
    const b = await (await GET(req({ lat: "40.7", lon: "-74" }))).json();
    expect(a).toEqual(b);
  });

  it("rejects out-of-range coordinates", async () => {
    const { GET } = await import("./route");
    const res = await GET(req({ lat: "-1.28", lon: "999" }));
    expect(res.status).toBe(400);
  });

  it("rate-limits a single IP after the per-minute budget", async () => {
    const { GET } = await import("./route");
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 61; i++) {
      const res = await GET(req({ lat: "-1.28", lon: "36.8" }, ip));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
