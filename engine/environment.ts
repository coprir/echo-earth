/**
 * ECHO EARTH — Environment Engine
 *
 * Pure functions that take everything the organism can sense and resolve it
 * into a Theme: palette, particle weather, motion intensity, typography mood.
 * No React in this file — it is the deterministic "genome" of the organism.
 */

export type TimePhase = "dawn" | "day" | "dusk" | "night" | "latenight";
export type Season = "winter" | "spring" | "summer" | "autumn";
export type WeatherKind = "clear" | "clouds" | "rain" | "drizzle" | "thunder" | "snow" | "mist" | "unknown";
export type DeviceKind = "phone" | "tablet" | "desktop";
export type PerfTier = "survival" | "low" | "mid" | "high";
export type ParticleMode = "none" | "dust" | "rain" | "snow" | "embers" | "fireflies" | "frost";

export interface EnvSignals {
  now: Date;
  lat: number | null;
  lon: number | null;
  city: string | null;
  country: string | null;
  weather: { kind: WeatherKind; tempC: number | null; description: string };
  device: DeviceKind;
  isTouch: boolean;
  screenW: number;
  screenH: number;
  batteryLevel: number | null; // 0..1
  batterySaver: boolean;
  netSpeed: "slow" | "fast" | "unknown";
  prefersDark: boolean;
  prefersReducedMotion: boolean;
  perfTier: PerfTier;
  motionEnergy: number; // 0..1 rolling average from device motion / scroll velocity
  visitorSeed: number; // stable per-visitor random seed (0..1)
  mutationTick: number; // increments every few minutes — slow drift
}

export interface Palette {
  bg: string;
  bgDeep: string;
  surface: string;
  glow: string;
  accent: string;
  accent2: string;
  text: string;
  textDim: string;
  line: string;
}

export interface Theme {
  id: string;
  label: string; // shown to the user as the organism's current "mood"
  phase: TimePhase;
  season: Season;
  palette: Palette;
  particles: ParticleMode;
  particleDensity: number; // 0..1
  breathSeconds: number; // breathing cycle length
  motionIntensity: number; // 0..1 scales all animation amplitudes
  glassBlur: number; // px
  fontMood: "geometric" | "humanist" | "mono";
  audioMood: "warm" | "cold" | "neon" | "rainy";
}

export function timePhase(d: Date): TimePhase {
  const h = d.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  if (h >= 20 || h < 1) return "night";
  return "latenight";
}

export function season(d: Date, lat: number | null): Season {
  const m = d.getMonth(); // 0..11
  const north = lat === null || lat >= 0;
  const northSeason: Season = m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  if (north) return northSeason;
  const flip: Record<Season, Season> = { winter: "summer", spring: "autumn", summer: "winter", autumn: "spring" };
  return flip[northSeason];
}

/** Seeded, drifting hue rotation so no two visitors (or two hours) look identical. */
function drift(base: number, seed: number, tick: number, range = 14): number {
  const wobble = Math.sin(seed * 97.7 + tick * 0.7) * range;
  return (base + wobble + 360) % 360;
}

const h = (hue: number, s: number, l: number, a = 1) => `hsla(${Math.round(hue)}, ${s}%, ${l}%, ${a})`;

interface Mood {
  label: string;
  baseHue: number;
  accentHue: number;
  particles: ParticleMode;
  audio: Theme["audioMood"];
  light: boolean; // light-ink variant
  font: Theme["fontMood"];
}

/** The organism's personality table: weather × phase × season → mood. */
function resolveMood(phase: TimePhase, s: Season, w: WeatherKind): Mood {
  if (w === "snow" || (s === "winter" && (w === "mist" || w === "clouds")))
    return { label: "Frostform", baseHue: 210, accentHue: 185, particles: w === "snow" ? "snow" : "frost", audio: "cold", light: false, font: "geometric" };
  if (w === "rain" || w === "drizzle" || w === "thunder")
    return { label: "Rainmind", baseHue: 222, accentHue: 200, particles: "rain", audio: "rainy", light: false, font: "humanist" };
  if (phase === "latenight")
    return { label: "Neon Drift", baseHue: 280, accentHue: 320, particles: "fireflies", audio: "neon", light: false, font: "mono" };
  if (phase === "night")
    return { label: "Nightbloom", baseHue: 250, accentHue: 190, particles: "fireflies", audio: "neon", light: false, font: "geometric" };
  if (phase === "dusk")
    return { label: "Emberfall", baseHue: 18, accentHue: 340, particles: "embers", audio: "warm", light: false, font: "humanist" };
  if (phase === "dawn")
    return { label: "First Light", baseHue: 28, accentHue: 200, particles: "dust", audio: "warm", light: true, font: "humanist" };
  // daytime
  if (s === "summer") return { label: "Goldenform", baseHue: 38, accentHue: 16, particles: "dust", audio: "warm", light: true, font: "humanist" };
  if (s === "winter") return { label: "Palefire", baseHue: 205, accentHue: 230, particles: "frost", audio: "cold", light: true, font: "geometric" };
  if (s === "autumn") return { label: "Rustwind", baseHue: 24, accentHue: 48, particles: "embers", audio: "warm", light: true, font: "humanist" };
  return { label: "Verdant Pulse", baseHue: 140, accentHue: 90, particles: "dust", audio: "warm", light: true, font: "humanist" };
}

export function resolveTheme(env: EnvSignals): Theme {
  const phase = timePhase(env.now);
  const s = season(env.now, env.lat);
  const mood = resolveMood(phase, s, env.weather.kind);

  const seed = env.visitorSeed;
  const tick = env.mutationTick;
  const base = drift(mood.baseHue, seed, tick);
  const acc = drift(mood.accentHue, seed + 0.31, tick, 20);

  const survival = env.batterySaver || (env.batteryLevel !== null && env.batteryLevel < 0.15);
  const dark = survival ? true : mood.light ? false : true;
  // "light" moods still run on deep canvases at ECHO EARTH — light means luminous, not white.
  const lum = mood.light && !survival;

  const palette: Palette = {
    bg: lum ? h(base, 45, 12) : h(base, 55, 6),
    bgDeep: lum ? h(base, 50, 7) : h(base, 60, 3),
    surface: h(base, 40, lum ? 18 : 12, 0.55),
    glow: h(acc, 90, 60, 0.35),
    accent: h(acc, 95, lum ? 62 : 60),
    accent2: h(base, 80, 70),
    text: h(base, 25, 94),
    textDim: h(base, 18, 70, 0.85),
    line: h(acc, 60, 60, 0.18),
  };

  const tierDensity: Record<PerfTier, number> = { survival: 0, low: 0.25, mid: 0.6, high: 1 };
  const tier: PerfTier = survival ? "survival" : env.perfTier;

  return {
    id: `${mood.label}-${phase}-${s}-${tick}`,
    label: survival ? "Survival Mode" : mood.label,
    phase,
    season: s,
    palette,
    particles: tier === "survival" || env.prefersReducedMotion ? "none" : mood.particles,
    particleDensity: env.prefersReducedMotion ? 0 : tierDensity[tier] * (0.6 + 0.4 * env.motionEnergy),
    breathSeconds: survival ? 12 : phase === "latenight" ? 9 : 6.5,
    motionIntensity: env.prefersReducedMotion ? 0 : survival ? 0.15 : tier === "low" ? 0.45 : tier === "mid" ? 0.75 : 1,
    glassBlur: tier === "survival" || tier === "low" ? 6 : 18,
    fontMood: mood.font,
    audioMood: mood.audio,
  };
}

/** Apply a theme to the document as CSS variables — the whole UI reads these. */
export function applyTheme(t: Theme): void {
  const r = document.documentElement;
  const p = t.palette;
  const vars: Record<string, string> = {
    "--ee-bg": p.bg,
    "--ee-bg-deep": p.bgDeep,
    "--ee-surface": p.surface,
    "--ee-glow": p.glow,
    "--ee-accent": p.accent,
    "--ee-accent2": p.accent2,
    "--ee-text": p.text,
    "--ee-text-dim": p.textDim,
    "--ee-line": p.line,
    "--ee-breath": `${t.breathSeconds}s`,
    "--ee-blur": `${t.glassBlur}px`,
    "--ee-motion": `${t.motionIntensity}`,
  };
  for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v);
  r.dataset.eeTheme = t.label;
  r.dataset.eePhase = t.phase;
}
