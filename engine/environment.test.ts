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
