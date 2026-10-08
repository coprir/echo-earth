import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import Consciousness, { compose, type ComposeInput } from "./Consciousness";
import type { EnvSignals } from "@/engine/environment";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";

function env(overrides: Partial<EnvSignals> = {}): EnvSignals {
  return {
    now: new Date("2026-01-01T12:00:00"), // "day" phase
    lat: 0,
    lon: 0,
    city: null,
    country: null,
    weather: { kind: "unknown", tempC: null, description: "" },
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
    motionEnergy: 0,
    visitorSeed: 0,
    mutationTick: 0,
    ...overrides,
  };
}

const t = (key: string, vars?: Record<string, string | number>) => {
  let s = key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
};

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    env: env(),
    atmosphere: "auto",
    travel: "still",
    favorites: [],
    idleMs: 0,
    t,
    ...overrides,
  };
}

describe("compose (pure)", () => {
  it("falls back to the phase line when nothing else applies", () => {
    expect(compose(0, input())).toBe("nar.phase");
  });

  it("the atmosphere whisper always wins over a merely-present phase line (weight 6 vs 2, no seed can flip it)", () => {
    for (const seed of [0, 1, 5, 123.456, -7]) {
      expect(compose(seed, input({ atmosphere: "neonstorm" }))).toBe("atmo.neonstorm.whisper");
    }
  });

  it("the driving line always wins over a merely-present phase line (weight 7 vs 2)", () => {
    for (const seed of [0, 1, 5, 123.456, -7]) {
      expect(compose(seed, input({ travel: "driving" }))).toBe("nar.driving");
    }
  });

  it("the walking line can win over the phase line (weight 4 vs 2 — no safe margin across all seeds, so this checks one hand-verified seed rather than asserting it always wins)", () => {
    // seed=2: walking (index 0) multiplier 0.6+0.8*|sin(3.4)|≈0.804 → score
    // ≈3.22; phase (index 1) multiplier 0.6+0.8*|sin(4.4)|≈1.361 → score
    // ≈2.72. Walking wins here, though not for every seed (unlike driving's
    // weight-7 margin, which always beats phase's weight-2 worst case).
    expect(compose(2, input({ travel: "walking" }))).toBe("nar.walking");
  });

  it("the idle line appears once idleMs exceeds the threshold", () => {
    for (const seed of [0, 1, 5, 123.456, -7]) {
      expect(compose(seed, input({ idleMs: 20000 }))).toBe("nar.idle");
    }
  });

  it("the weather line appears only for active (non-clear, non-unknown) weather", () => {
    const clear = compose(0, input({ env: env({ weather: { kind: "clear", tempC: 20, description: "" } }) }));
    expect(clear).toBe("nar.phase"); // clear weather does not count as "active"
    for (const seed of [0, 1, 5, 123.456, -7]) {
      const rainy = compose(seed, input({ env: env({ weather: { kind: "rain", tempC: 20, description: "" } }) }));
      expect(rainy).toBe("nar.weather");
    }
  });

  it("includes a city-sync candidate only when env.city is set — golden case at seed=0", () => {
    // Hand-computed: at seed 0 with only phase(weight 2, index 0) and
    // sync(weight 1, index 1) present, the multiplier is
    // 0.6 + 0.8*|sin(seed*1.7 + i)| — phase: 0.6+0.8*|sin(0)|=0.6 → score
    // 1.2; sync: 0.6+0.8*|sin(1)|≈1.2732 → score ≈1.2732. Sync wins.
    expect(compose(0, input({ env: env({ city: "Paris" }) }))).toBe("nar.sync");
    // with no city, sync can never be a candidate — phase is the only one
    expect(compose(0, input({ env: env({ city: null }) }))).toBe("nar.phase");
  });

  it("the returning-favorite candidate only ever appears when favorites is non-empty", () => {
    // at seeds where sin(seed*2.3) has |.| <= 0.6, the returning candidate is
    // never added even with favorites present — but with favorites empty it
    // must NEVER appear regardless of seed
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(compose(seed, input({ favorites: [] }))).not.toBe("nar.returning");
    }
  });
});

describe("Consciousness component", () => {
  // Deliberately uses real timers, not vi.useFakeTimers(): combining faked
  // timers with a real render() here hung indefinitely in practice (the
  // vitest worker never exited and had to be killed) — framer-motion's
  // AnimatePresence/motion.p and/or React's own internal scheduler depend on
  // timer/RAF primitives in ways that don't tolerate a globally-faked clock
  // under this component. The detailed candidate-selection logic (including
  // the env.city / env.now fields that motivated the stale-closure fix
  // below) is already fully covered by the pure `compose()` tests above,
  // which need no timers at all — this test only needs to prove the
  // component mounts and speaks, for real, without crashing.
  it("mounts and renders a narration line within its first speaking cadence", async () => {
    useAdaptiveMind.setState({ atmosphere: "auto", travel: "still", mode: "explore", affinities: {} });
    render(<Consciousness env={env({ city: "Paris" })} />);
    // Testing Library's own waitFor (not vi.waitFor) — it wraps each poll in
    // act(), which the component's real setTimeout-driven state update needs
    // to avoid an "update not wrapped in act()" warning.
    await waitFor(() => expect(document.body.textContent).not.toBe(""), { timeout: 2000 });
  });
});
