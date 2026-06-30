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

/**
 * Artificial emotional weather — the visitor can override the organism's
 * natural mood with a synthetic atmosphere. "auto" follows the real world.
 */
export type Atmosphere =
  | "auto"
  | "dream"
  | "neonstorm"
  | "calmpulse"
  | "goldensunset"
  | "cyberrain"
  | "midnight"
  | "aurora"
  | "chaos";

export const ATMOSPHERES: { id: Atmosphere; label: string; whisper: string }[] = [
  { id: "auto", label: "Synced", whisper: "breathing with the real sky" },
  { id: "dream", label: "Dream", whisper: "the city drifts half-asleep" },
  { id: "neonstorm", label: "Neon Storm", whisper: "voltage in the air" },
  { id: "calmpulse", label: "Calm Pulse", whisper: "everything slows to a heartbeat" },
  { id: "goldensunset", label: "Golden Sunset", whisper: "the hour that forgives everything" },
  { id: "cyberrain", label: "Cyber Rain", whisper: "chrome streets, falling light" },
  { id: "midnight", label: "Midnight Silence", whisper: "only the open doors are awake" },
  { id: "aurora", label: "Aurora", whisper: "the sky is leaking color" },
  { id: "chaos", label: "Chaos", whisper: "the city forgot its own rules" },
];

const SYNTHETIC_MOODS: Record<Exclude<Atmosphere, "auto">, Mood> = {
  dream: { label: "Dream", baseHue: 265, accentHue: 300, particles: "fireflies", audio: "warm", light: false, font: "humanist" },
  neonstorm: { label: "Neon Storm", baseHue: 305, accentHue: 180, particles: "rain", audio: "neon", light: false, font: "mono" },
  calmpulse: { label: "Calm Pulse", baseHue: 165, accentHue: 145, particles: "dust", audio: "warm", light: false, font: "humanist" },
  goldensunset: { label: "Golden Sunset", baseHue: 24, accentHue: 340, particles: "embers", audio: "warm", light: false, font: "humanist" },
  cyberrain: { label: "Cyber Rain", baseHue: 195, accentHue: 170, particles: "rain", audio: "rainy", light: false, font: "mono" },
  midnight: { label: "Midnight Silence", baseHue: 235, accentHue: 255, particles: "frost", audio: "cold", light: false, font: "geometric" },
  aurora: { label: "Aurora", baseHue: 155, accentHue: 285, particles: "fireflies", audio: "cold", light: false, font: "geometric" },
  chaos: { label: "Chaos", baseHue: 0, accentHue: 55, particles: "embers", audio: "neon", light: false, font: "mono" },
};

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

export function resolveTheme(env: EnvSignals, atmosphere: Atmosphere = "auto"): Theme {
  const phase = timePhase(env.now);
  const s = season(env.now, env.lat);
  // Digital Weather System: a chosen synthetic atmosphere overrides the
  // organism's natural mood; "auto" keeps it synced to the real sky.
  const synthetic = atmosphere !== "auto";
  const mood = synthetic ? SYNTHETIC_MOODS[atmosphere] : resolveMood(phase, s, env.weather.kind);

  const seed = env.visitorSeed;
  const tick = env.mutationTick;
  // synthetic atmospheres drift faster and wider — they feel more "generated"
  const base = drift(mood.baseHue, seed, tick, synthetic ? 22 : 14);
  const acc = drift(mood.accentHue, seed + 0.31, tick, synthetic ? 30 : 20);

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

  // The interface renders identically on every device: richness is NOT scaled
  // by device performance tier. The only reducers are user/state conditions that
  // apply equally everywhere — Survival Mode (battery < 15% / save-data) and the
  // OS "reduce motion" accessibility preference.
  const tierDensity: Record<PerfTier, number> = { survival: 0, low: 0.25, mid: 0.6, high: 1 };
  const tier: PerfTier = survival ? "survival" : "high";

  // synthetic atmospheres bend the motion personality
  const moodMotion = atmosphere === "chaos" ? 1.25 : atmosphere === "calmpulse" || atmosphere === "midnight" ? 0.5 : 1;
  const baseMotion = survival ? 0.15 : 1;

  return {
    id: `${mood.label}-${phase}-${s}-${tick}-${atmosphere}`,
    label: survival ? "Survival Mode" : mood.label,
    phase,
    season: s,
    palette,
    particles: tier === "survival" || env.prefersReducedMotion ? "none" : mood.particles,
    particleDensity:
      env.prefersReducedMotion ? 0 : tierDensity[tier] * (0.6 + 0.4 * env.motionEnergy) * (synthetic ? 1.25 : 1),
    breathSeconds: survival ? 12 : atmosphere === "calmpulse" ? 11 : atmosphere === "chaos" ? 4.5 : phase === "latenight" ? 9 : 6.5,
    motionIntensity: env.prefersReducedMotion ? 0 : Math.min(1.3, baseMotion * moodMotion),
    glassBlur: tier === "survival" ? 6 : 18,
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
