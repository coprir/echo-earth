import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { log } from "@/lib/log";

/**
 * IP geolocation — instant, permission-free first guess at where the visitor is.
 * Uses edge/proxy headers when deployed (Vercel sets these), falls back to a
 * free IP lookup, then to a default city so the organism always wakes somewhere.
 */

export const runtime = "edge";

const FALLBACK = { lat: -1.2864, lon: 36.8172, city: "Nairobi", country: "KE" };

export async function GET(req: NextRequest) {
  const key = clientKey(req);
  const limit = checkRateLimit(`geo:${key}`, 60, 60_000);
  if (!limit.allowed) {
    log.warn({ route: "/api/geo", branch: "rate_limited" });
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } });
  }

  // 1. Platform headers (Vercel / Cloudflare) — free and instant. Vercel's
  // own edge network sets/overwrites `x-vercel-*` headers, but this app
  // doesn't control whether it's actually deployed behind Vercel or
  // Cloudflare in every environment — validate the parsed values as real
  // coordinates before trusting them as a "live" source, the same bar
  // /api/weather and /api/places already hold their own lat/lon inputs to,
  // rather than returning parseFloat("garbage") -> NaN dressed up as success.
  const hLat = req.headers.get("x-vercel-ip-latitude") ?? req.headers.get("cf-iplatitude");
  const hLon = req.headers.get("x-vercel-ip-longitude") ?? req.headers.get("cf-iplongitude");
  const parsedLat = hLat ? parseFloat(hLat) : NaN;
  const parsedLon = hLon ? parseFloat(hLon) : NaN;
  const validHeaderCoords =
    Number.isFinite(parsedLat) && Number.isFinite(parsedLon) && parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180;
  if (validHeaderCoords) {
    log.info({ route: "/api/geo", branch: "edge-header" });
    return NextResponse.json({
      lat: parsedLat,
      lon: parsedLon,
      city: req.headers.get("x-vercel-ip-city") ?? null,
      country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry"),
      source: "edge-header",
    });
  } else if (hLat || hLon) {
    log.warn({ route: "/api/geo", branch: "invalid_edge_header" });
  }

  // 2. Free IP geolocation (dev / self-hosted)
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const url = ip && ip !== "::1" && ip !== "127.0.0.1" ? `https://ipapi.co/${ip}/json/` : "https://ipapi.co/json/";
    const res = await fetchWithTimeout(url, {}, 3500);
    if (res.ok) {
      const d = await res.json();
      if (d.latitude != null) {
        log.info({ route: "/api/geo", branch: "ip" });
        return NextResponse.json({ lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_code, source: "ip" });
      }
      log.warn({ route: "/api/geo", branch: "ip_no_coords" });
    } else {
      log.warn({ route: "/api/geo", branch: `error:status_${res.status}` });
    }
  } catch {
    log.warn({ route: "/api/geo", branch: "error:network_error" });
  }

  return NextResponse.json({ ...FALLBACK, source: "fallback" });
}
