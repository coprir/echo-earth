import { describe, expect, it } from "vitest";
import { resolveTheme, season, timePhase, type EnvSignals } from "./environment";

function env(overrides: Partial<EnvSignals> = {}): EnvSignals {
  return {
    now: new Date("2026-06-15T12:00:00"),
    lat: 48.8566,
    lon: 2.3522,
    city: "Paris",
    country: "FR",
    weather: { kind: "clear", tempC: 22, description: "clear" },
    device: "desktop",
    isTouch: false,
    screenW: 1024,
    screenH: 768,
    batteryLevel: null,
    batterySaver: false,
    netSpeed: "unknown",
    prefersDark: true,
    prefersReducedMotion: false,
    perfTier: "high",
    motionEnergy: 0.4,
    visitorSeed: 0.5,
    mutationTick: 0,
    ...overrides,
  };
}

describe("timePhase", () => {
  it("resolves each boundary to the documented phase", () => {
    expect(timePhase(new Date("2026-01-01T04:00:00"))).toBe("latenight");
    expect(timePhase(new Date("2026-01-01T05:00:00"))).toBe("dawn");
    expect(timePhase(new Date("2026-01-01T08:00:00"))).toBe("day");
    expect(timePhase(new Date("2026-01-01T17:00:00"))).toBe("dusk");
    expect(timePhase(new Date("2026-01-01T20:00:00"))).toBe("night");
    expect(timePhase(new Date("2026-01-01T00:30:00"))).toBe("night");
  });
});

describe("season", () => {
  it("resolves the northern-hemisphere calendar for a positive/null latitude", () => {
    expect(season(new Date("2026-01-15"), 48)).toBe("winter");
    expect(season(new Date("2026-07-15"), 48)).toBe("summer");
    expect(season(new Date("2026-07-15"), null)).toBe("summer"); // null defaults north
  });

  it("flips the calendar for the southern hemisphere", () => {
    expect(season(new Date("2026-01-15"), -33)).toBe("summer"); // Sydney in January
    expect(season(new Date("2026-07-15"), -33)).toBe("winter");
  });
});

describe("resolveTheme — graceful degradation (PRF-1: do not change without a product decision)", () => {
  it("Survival Mode (battery saver) disables particles and sharply reduces (not zeroes) motion intensity, regardless of perf tier", () => {
    const t = resolveTheme(env({ batterySaver: true, perfTier: "high" }));
    expect(t.label).toBe("Survival Mode");
    expect(t.particles).toBe("none");
    expect(t.particleDensity).toBe(0);
    // slowed, not stopped — ARCHITECTURE.md describes Survival Mode as "slow
    // breath, minimal blur," distinct from prefers-reduced-motion's full 0
    expect(t.motionIntensity).toBeCloseTo(0.15, 5);
    expect(t.motionIntensity).toBeGreaterThan(0);
  });

  it("Survival Mode also triggers on low battery even without save-data", () => {
    const t = resolveTheme(env({ batterySaver: false, batteryLevel: 0.1 }));
    expect(t.label).toBe("Survival Mode");
    expect(t.particles).toBe("none");
  });

  it("battery above the 15% threshold does not trigger Survival Mode", () => {
    const t = resolveTheme(env({ batterySaver: false, batteryLevel: 0.2 }));
    expect(t.label).not.toBe("Survival Mode");
  });

  it("prefers-reduced-motion disables particles and zeroes motion intensity even at full battery/high perf", () => {
    const t = resolveTheme(env({ prefersReducedMotion: true, batterySaver: false, batteryLevel: 1, perfTier: "high" }));
    expect(t.particles).toBe("none");
    expect(t.particleDensity).toBe(0);
    expect(t.motionIntensity).toBe(0);
    // reduced motion is not Survival Mode — the rest of the theme (palette,
    // label) is untouched, only motion/particles are suppressed
    expect(t.label).not.toBe("Survival Mode");
  });

  it("a documented, deliberate product decision: perf tier ('low'/'mid') does NOT reduce particle density — only Survival Mode and reduced-motion do (see engine/environment.ts's `tier` comment and ARCHITECTURE.md §3)", () => {
    const low = resolveTheme(env({ perfTier: "low", batterySaver: false, prefersReducedMotion: false }));
    const high = resolveTheme(env({ perfTier: "high", batterySaver: false, prefersReducedMotion: false }));
    expect(low.particleDensity).toBe(high.particleDensity);
    expect(low.particles).toBe(high.particles);
  });
});

describe("palette contrast (A11Y: the generated accent must stay legible)", () => {
  /** WCAG relative luminance of an `hsla(h, s%, l%, a)` string, alpha ignored. */
  function luminance(hsla: string): number {
    const m = hsla.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
    if (!m) throw new Error(`not an hsl() colour: ${hsla}`);
    const [hue, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((hue % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const rgb =
      hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const off = l - c / 2;
    const lin = (v: number) => {
      const u = v + off;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  const ATMOS = ["auto", "dream", "neonstorm", "calmpulse", "goldensunset", "cyberrain", "midnight", "aurora", "chaos"] as const;
  const WEATHER = ["clear", "clouds", "rain", "drizzle", "thunder", "snow", "mist"] as const;

  // Hue drifts per visitor seed and mutates on a timer, and HSL lightness is not
  // perceived brightness — a blue accent carries ~a tenth the luminance of a
  // yellow one at the same lightness. So this sweeps the whole reachable space
  // rather than spot-checking one palette.
  it("keeps accentSolid/onAccent at AA 4.5:1 for every mood, season, hour, weather and visitor seed", () => {
    let worst = { ratio: Infinity, where: "" };
    for (const atmosphere of ATMOS) {
      for (const weather of WEATHER) {
        for (const month of [0, 3, 6, 9]) {
          for (const hour of [0, 3, 6, 10, 18, 21]) {
            for (const seed of [0, 0.17, 0.33, 0.5, 0.71, 0.93]) {
              for (const tick of [0, 1, 2, 3, 4, 5]) {
                const t = resolveTheme(
                  env({
                    now: new Date(2026, month, 15, hour),
                    weather: { kind: weather, tempC: 10, description: weather },
                    visitorSeed: seed,
                    mutationTick: tick,
                  }),
                  atmosphere
                );
                const r = ratio(t.palette.accentSolid, t.palette.onAccent);
                if (r < worst.ratio) {
                  worst = { ratio: r, where: `${atmosphere}/${weather}/m${month}/h${hour}/seed${seed}/tick${tick}` };
                }
              }
            }
          }
        }
      }
    }
    expect(worst.ratio, `worst pairing was ${worst.where} at ${worst.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves accent itself untouched — only the filled-surface variant is lifted", () => {
    // accent still carries the glow/border/neuron role; lifting it there would
    // wash out the organism, so accentSolid is a strictly separate token
    const t = resolveTheme(env({ now: new Date("2026-01-15T12:00:00") }), "midnight");
    expect(t.palette.accent).toMatch(/^hsla\(/);
    expect(luminance(t.palette.accentSolid)).toBeGreaterThanOrEqual(luminance(t.palette.accent));
  });

  it("keeps body text and dim text legible on the canvas", () => {
    for (const atmosphere of ATMOS) {
      const t = resolveTheme(env(), atmosphere);
      expect(ratio(t.palette.text, t.palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.palette.textDim, t.palette.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
