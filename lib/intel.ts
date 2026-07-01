/**
 * ECHO EARTH — Tourism & Mobility Intelligence engine.
 *
 * Turns location + time + weather + season into a live "pulse" of a city:
 * an activity index, 24h movement curve, AI demand forecasts, trending &
 * emerging zones, visitor source mix, local-vs-tourist split and spend.
 *
 * Deterministic and offline (demo intelligence) so the command centre always
 * has a believable, stable-yet-evolving signal — seeded by the place + day,
 * modulated live by the hour, weather and season. This is the presentation +
 * forecast layer; real anonymized movement streams (Kafka/edge) plug into the
 * same shapes later without touching the UI.
 */

import type { WeatherKind, Season } from "@/engine/environment";

export interface Forecast {
  id: string;
  label: string;
  now: number; // 0..100 current demand
  next: number; // 0..100 predicted in ~2h
  driver: string; // short AI rationale
}

export interface Zone {
  name: string;
  intensity: number; // 0..100
  delta: number; // % change vs typical
  emerging: boolean;
  x: number; // 0..1 map position
  y: number;
  hue: number;
}

export interface Source {
  code: string; // ISO-2
  name: string;
  pct: number;
}

export interface Intel {
  energyIndex: number; // 0..100 overall city pulse
  trend: number; // -100..100 vs an hour ago
  headline: string; // "what's trending tonight"
  hourly: number[]; // 24 activity values 0..100
  peakHour: number;
  forecasts: Forecast[];
  zones: Zone[];
  sources: Source[];
  localPct: number; // vs tourist
  spendEstimate: number; // avg € per visitor tonight
  weatherImpact: string;
  crowd: "sparse" | "steady" | "busy" | "surging";
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A believable city-activity value for a given hour (0..1 before modulation). */
function hourBase(h: number): number {
  // two civic peaks (lunch ~13, evening ~20) + a nightlife tail
  const lunch = Math.exp(-((h - 13) ** 2) / 6) * 0.6;
  const evening = Math.exp(-((h - 20) ** 2) / 7) * 0.85;
  const night = h >= 22 || h <= 2 ? 0.55 * Math.exp(-((((h + 2) % 24) - 3) ** 2) / 10) + (h >= 22 ? 0.45 : 0.35) : 0;
  const day = Math.exp(-((h - 15) ** 2) / 60) * 0.4;
  return Math.min(1, 0.12 + lunch + evening * 0.9 + night + day * 0.3);
}

const ZONE_BANK = [
  "Old Quarter", "Marina District", "Seafront Strip", "The Heights", "Arts Quarter", "Harbour Row",
  "Uptown", "Garden Terraces", "Neon Mile", "The Bazaar", "Riverside", "Skyline Plaza", "Lantern Alley", "Sunset Point",
];

/** Rough visitor-source mix by world region (lon/lat heuristic). */
function regionSources(lat: number, lon: number): { code: string; name: string }[] {
  if (lon >= 100 && lon <= 150) return [["CN", "China"], ["JP", "Japan"], ["KR", "Korea"], ["US", "USA"], ["AU", "Australia"], ["SG", "Singapore"]].map(([code, name]) => ({ code, name }));
  if (lon >= 34 && lon <= 60 && lat >= 12 && lat <= 42) return [["SA", "Saudi Arabia"], ["AE", "UAE"], ["GB", "UK"], ["IN", "India"], ["EG", "Egypt"], ["RU", "Russia"]].map(([code, name]) => ({ code, name }));
  if (lon >= -170 && lon <= -30) return [["US", "USA"], ["CA", "Canada"], ["BR", "Brazil"], ["MX", "Mexico"], ["GB", "UK"], ["DE", "Germany"]].map(([code, name]) => ({ code, name }));
  if (lat >= -35 && lat <= 15 && lon >= -20 && lon <= 52) return [["GB", "UK"], ["US", "USA"], ["KE", "Kenya"], ["IN", "India"], ["FR", "France"], ["ZA", "S. Africa"]].map(([code, name]) => ({ code, name }));
  // Europe / Mediterranean default
  return [["GB", "UK"], ["DE", "Germany"], ["RU", "Russia"], ["FR", "France"], ["IL", "Israel"], ["SE", "Sweden"]].map(([code, name]) => ({ code, name }));
}

/** ISO-2 → flag emoji. */
export function flag(code: string): string {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function computeIntel(opts: {
  lat: number;
  lon: number;
  now: Date;
  weather: WeatherKind;
  season: Season;
}): Intel {
  const { lat, lon, now, weather, season } = opts;
  const h = now.getHours() + now.getMinutes() / 60;
  const day = Math.floor(now.getTime() / 86400000);
  const weekend = [0, 5, 6].includes(now.getDay());
  const rand = mulberry32(Math.floor(lat * 100) * 73 + Math.floor(lon * 100) * 31 + day * 17);

  const wet = weather === "rain" || weather === "drizzle" || weather === "thunder" || weather === "snow";
  const clear = weather === "clear";
  const warm = season === "summer" || season === "spring";

  // ---- 24h curve ----
  const hourly = Array.from({ length: 24 }, (_, hr) => {
    let v = hourBase(hr) * 100;
    if (weekend && (hr >= 21 || hr <= 2)) v *= 1.2;
    if (wet) v *= hr >= 12 && hr <= 18 ? 0.8 : 0.92; // rain thins daytime outdoor
    if (warm) v *= 1.08;
    v *= 0.9 + rand() * 0.2;
    return Math.max(4, Math.min(100, Math.round(v)));
  });
  const peakHour = hourly.indexOf(Math.max(...hourly));

  const energyIndex = Math.round(hourly[Math.floor(h) % 24] * (weekend ? 1.05 : 1) * (clear ? 1.05 : 1));
  const prev = hourly[(Math.floor(h) + 23) % 24];
  const trend = Math.round(((energyIndex - prev) / Math.max(prev, 1)) * 100);

  const crowd: Intel["crowd"] = energyIndex > 78 ? "surging" : energyIndex > 55 ? "busy" : energyIndex > 30 ? "steady" : "sparse";

  // ---- forecasts ----
  const nightish = h >= 20 || h <= 3;
  const mealtime = (h >= 12 && h <= 14) || (h >= 19 && h <= 22);
  const fc = (id: string, label: string, base: number, driver: string): Forecast => {
    const now = Math.max(3, Math.min(100, Math.round(base * (0.9 + rand() * 0.2))));
    const next = Math.max(3, Math.min(100, Math.round(now * (0.85 + rand() * 0.4))));
    return { id, label, now, next, driver };
  };
  const forecasts: Forecast[] = [
    fc("nightlife", "Nightlife demand", nightish ? 70 + (weekend ? 20 : 0) : 25, nightish ? (weekend ? "weekend + late hour" : "evening rising") : "builds after 20:00"),
    fc("dining", "Restaurant surge", mealtime ? 80 : 35, mealtime ? "peak dining window" : wet ? "rain pushing indoors" : "between services"),
    fc("beach", "Beach occupancy", clear && warm && h >= 9 && h <= 18 ? 82 : 20, clear && warm ? "clear & warm" : wet ? "washed out by weather" : "off-hours"),
    fc("transport", "Transport load", h >= 7 && h <= 9 ? 78 : h >= 16 && h <= 19 ? 82 : 30, h >= 16 && h <= 19 ? "evening rush" : h >= 7 && h <= 9 ? "morning rush" : "flowing freely"),
    fc("hotel", "Hotel demand", warm ? 68 : 45, warm ? "high season" : "shoulder season"),
    fc("events", "Event attendance", nightish && weekend ? 74 : 40, weekend ? "weekend programming" : "midweek calm"),
  ];

  // ---- zones ----
  const zoneCount = 8;
  const picked = [...ZONE_BANK].sort(() => rand() - 0.5).slice(0, zoneCount);
  const zones: Zone[] = picked.map((name, i) => {
    const intensity = Math.max(8, Math.min(100, Math.round(energyIndex * (0.5 + rand() * 0.9))));
    const delta = Math.round((rand() * 60 - 20));
    return {
      name,
      intensity,
      delta,
      emerging: delta > 22 && intensity < 70,
      x: 0.12 + rand() * 0.76,
      y: 0.15 + rand() * 0.7,
      hue: Math.round(rand() * 360),
    };
  });

  // ---- sources ----
  const bank = regionSources(lat, lon);
  const weights = bank.map(() => 0.4 + rand());
  const total = weights.reduce((a, b) => a + b, 0);
  const sources: Source[] = bank
    .map((s, i) => ({ ...s, pct: Math.round((weights[i] / total) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const localPct = Math.round(28 + rand() * 34);
  const spendEstimate = Math.round((nightish ? 60 : mealtime ? 45 : 30) * (warm ? 1.2 : 1) * (0.8 + rand() * 0.6));

  const weatherImpact = wet
    ? "Rain is redirecting flow indoors — cafés, bars and malls are absorbing the outdoor crowd."
    : clear && warm
    ? "Clear, warm skies are pulling movement toward the seafront and open-air venues."
    : "Mild conditions — movement is following its usual civic rhythm.";

  const headline = nightish
    ? weekend
      ? `${zones[0].name} is surging — nightlife peaking across the ${bank[0].name} crowd`
      : `${zones[0].name} is warming up — evening pulse building`
    : mealtime
    ? `Dining demand concentrated in ${zones[0].name}`
    : `${zones[0].name} leads daytime movement`;

  return {
    energyIndex,
    trend,
    headline,
    hourly,
    peakHour,
    forecasts,
    zones,
    sources,
    localPct,
    spendEstimate,
    weatherImpact,
    crowd,
  };
}
