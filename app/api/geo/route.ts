import { NextRequest, NextResponse } from "next/server";

/**
 * IP geolocation — instant, permission-free first guess at where the visitor is.
 * Uses edge/proxy headers when deployed (Vercel sets these), falls back to a
 * free IP lookup, then to a default city so the organism always wakes somewhere.
 */

export const runtime = "edge";

const FALLBACK = { lat: -1.2864, lon: 36.8172, city: "Nairobi", country: "KE" };

export async function GET(req: NextRequest) {
  // 1. Platform headers (Vercel / Cloudflare) — free and instant
  const hLat = req.headers.get("x-vercel-ip-latitude") ?? req.headers.get("cf-iplatitude");
  const hLon = req.headers.get("x-vercel-ip-longitude") ?? req.headers.get("cf-iplongitude");
  if (hLat && hLon) {
    return NextResponse.json({
      lat: parseFloat(hLat),
      lon: parseFloat(hLon),
      city: req.headers.get("x-vercel-ip-city") ?? null,
      country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry"),
      source: "edge-header",
    });
  }

  // 2. Free IP geolocation (dev / self-hosted)
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const url = ip && ip !== "::1" && ip !== "127.0.0.1" ? `https://ipapi.co/${ip}/json/` : "https://ipapi.co/json/";
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const d = await res.json();
      if (d.latitude != null) {
        return NextResponse.json({ lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_code, source: "ip" });
      }
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ ...FALLBACK, source: "fallback" });
}
