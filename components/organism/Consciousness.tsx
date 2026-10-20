"use client";

/**
 * Consciousness — the visible voice of the City Consciousness AI, now spoken in
 * the visitor's language. It composes a short line from the live context
 * (atmosphere, weather, time, travel, idleness, learned taste) and recomposes
 * on a gentle cadence — recombining translated fragments so the voice stays
 * alive in every language.
 *
 * Deliberately deterministic (Phase 7 audit, CNS-1 in IMPLEMENTATION_PLAN.md):
 * this runs continuously (every ~14s) for as long as the organism is awake —
 * an LLM call at that frequency would be slower, costlier, and not actually
 * better than the tuned phrase banks below. No code change here routes this
 * through an AI call; see docs/city-consciousness-audit.md for the full
 * audit record.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Atmosphere, EnvSignals, TimePhase } from "@/engine/environment";
import { useAdaptiveMind, type TravelMode } from "@/engine/useAdaptiveMind";
import type { CategoryId } from "@/lib/places";
import { useT } from "@/lib/i18n";

function phaseOf(d: Date): TimePhase {
  const h = d.getHours();
  return h < 5 ? "latenight" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "dusk" : "night";
}

export interface ComposeInput {
  env: EnvSignals;
  atmosphere: Atmosphere;
  travel: TravelMode;
  favorites: CategoryId[];
  idleMs: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/**
 * Pure candidate-weighting function — extracted from the component so it's
 * unit-testable without React/timers/DOM (it had zero test coverage before
 * the Phase 7 audit). Takes every input explicitly rather than closing over
 * component state, which also eliminates the stale-closure risk the
 * component-level fix below guards against.
 */
export function compose(seed: number, input: ComposeInput): string {
  const { env, atmosphere, travel, favorites, idleMs, t } = input;
  const cands: { text: string; weight: number }[] = [];
  const weatherActive = env.weather.kind !== "unknown" && env.weather.kind !== "clear";

  if (atmosphere !== "auto") cands.push({ text: t(`atmo.${atmosphere}.whisper`), weight: 6 });
  if (idleMs > 18000) cands.push({ text: t("nar.idle"), weight: 5 });
  if (travel === "driving") cands.push({ text: t("nar.driving"), weight: 7 });
  else if (travel === "walking") cands.push({ text: t("nar.walking"), weight: 4 });
  if (weatherActive) cands.push({ text: t("nar.weather", { w: t(`weather.${env.weather.kind}`) }), weight: 5 });
  if (favorites.length && Math.abs(Math.sin(seed * 2.3)) > 0.6) cands.push({ text: t("nar.returning", { fav: t(`cat.${favorites[0]}`) }), weight: 4 });
  cands.push({ text: t("nar.phase", { p: t(`phase.${phaseOf(env.now)}`) }), weight: 2 });
  if (env.city) cands.push({ text: t("nar.sync", { city: env.city }), weight: 1 });

  const scored = cands.map((c, i) => ({ c, s: c.weight * (0.6 + 0.8 * Math.abs(Math.sin(seed * 1.7 + i))) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.c.text ?? "";
}

export default function Consciousness({ env }: { env: EnvSignals }) {
  const mind = useAdaptiveMind();
  const { t, lang } = useT();
  const [line, setLine] = useState<string | null>(null);
  const seedRef = useRef(env.visitorSeed * 1000);
  const lastTouchRef = useRef(Date.now());

  useEffect(() => {
    const touch = () => (lastTouchRef.current = Date.now());
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    window.addEventListener("scroll", touch, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("scroll", touch);
    };
  }, []);

  // Runs `compose` with whatever is current *at call time* — reassigned on
  // every render, so the interval below (set up only on the specific
  // cadence-restart triggers) always calls into fresh env/mind state instead
  // of whatever was captured when it was last (re)created. Fixes a real
  // staleness bug found in the Phase 7 audit: `env.now` (phase-of-day) and
  // `env.city` could previously go stale for as long as weather/mode/
  // atmosphere/travel stayed constant — plausibly hours — because they
  // aren't in the effect's restart-trigger list below (deliberately, to keep
  // the speaking cadence steady rather than resetting on every env tick).
  const tickRef = useRef<(increment: number) => string>(() => "");
  tickRef.current = (increment: number) => {
    const idleMs = Date.now() - lastTouchRef.current;
    return compose((seedRef.current += increment), {
      env,
      atmosphere: mind.atmosphere,
      travel: mind.travel,
      favorites: mind.favorites(),
      idleMs,
      t,
    });
  };

  // first words + steady cadence; rebuilds when language or context shifts so the
  // voice always speaks the current language (tickRef always reads live state)
  useEffect(() => {
    const first = setTimeout(() => setLine(tickRef.current(0.91)), 500);
    const id = setInterval(() => setLine(tickRef.current(1.618)), 14000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [lang, env.weather.kind, mind.mode, mind.atmosphere, mind.travel]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-20 flex justify-center px-6" aria-live="polite">
      <AnimatePresence mode="wait">
        {line && (
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[34rem] text-center text-[0.95rem] font-light leading-relaxed tracking-wide"
            style={{ color: "var(--ee-text)", textShadow: "0 0 28px var(--ee-glow)" }}
          >
            <span className="me-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full ee-breathe align-middle" style={{ background: "var(--ee-accent)", boxShadow: "0 0 10px var(--ee-accent)" }} aria-hidden />
            {line}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
