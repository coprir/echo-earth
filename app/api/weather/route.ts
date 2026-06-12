import { NextRequest, NextResponse } from "next/server";

/**
 * Weather sense. Proxies OpenWeather when OPENWEATHER_API_KEY is set;
 * otherwise synthesizes plausible weather from latitude + season + hour so
 * the organism always has an atmosphere to express.
 */

type Kind = "clear" | "clouds" | "rain" | "drizzle" | "thunder" | "snow" | "mist" | "unknown";

const OW_MAP: Record<string, Kind> = {
  Clear: "clear",
  Clouds: "clouds",
  Rain: "rain",
  Drizzle: "drizzle",
  Thunderstorm: "thunder",
  Snow: "snow",
  Mist: "mist",
  Fog: "mist",
  Haze: "mist",
};

function synthesize(lat: number): { kind: Kind; tempC: number; description: string } {
  const month = new Date().getMonth();
  const north = lat >= 0;
  const winter = north ? month <= 1 || month === 11 : month >= 5 && month <= 7;
  const absLat = Math.abs(lat);
  // colder at higher latitudes, plus a seasonal swing
  const base = 28 - absLat * 0.45 + (winter ? -8 : 4);
  // deterministic per-day variety so it changes, but not per-request
  const day = Math.floor(Date.now() / 86400000);
  const roll = ((day * 2654435761) >>> 16) % 100;
  let kind: Kind = "clear";
  if (winter && absLat > 45 && roll < 35) kind = "snow";
  else if (roll < 22) kind = "rain";
  else if (roll < 45) kind = "clouds";
  else if (roll < 52) kind = "mist";
  return { kind, tempC: Math.round(base), description: `${kind} skies (echo-sensed)` };
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lon = parseFloat(req.nextUrl.searchParams.get("lon") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`,
        { next: { revalidate: 600 } }
      );
      if (res.ok) {
        const d = await res.json();
        const main = d.weather?.[0]?.main ?? "Clear";
        return NextResponse.json({
          kind: OW_MAP[main] ?? "unknown",
          tempC: Math.round(d.main?.temp ?? 20),
          description: d.weather?.[0]?.description ?? main,
          source: "openweather",
        });
      }
    } catch {
      // fall through to synthesis
    }
  }

  return NextResponse.json({ ...synthesize(lat), source: "echo" });
}
