"use client";

/**
 * Consciousness — the visible voice of the City Consciousness AI, now spoken in
 * the visitor's language. It composes a short line from the live context
 * (atmosphere, weather, time, travel, idleness, learned taste) and recomposes
 * on a gentle cadence — recombining translated fragments so the voice stays
 * alive in every language.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EnvSignals, TimePhase } from "@/engine/environment";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";
import { useT } from "@/lib/i18n";

function phaseOf(d: Date): TimePhase {
  const h = d.getHours();
  return h < 5 ? "latenight" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "dusk" : "night";
}

export default function Consciousness({ env }: { env: EnvSignals; category: string; placeCount: number }) {
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

  const compose = (seed: number): string => {
    const cands: { text: string; weight: number }[] = [];
    const weatherActive = env.weather.kind !== "unknown" && env.weather.kind !== "clear";
    const idle = Date.now() - lastTouchRef.current;

    if (mind.atmosphere !== "auto") cands.push({ text: t(`atmo.${mind.atmosphere}.whisper`), weight: 6 });
    if (idle > 18000) cands.push({ text: t("nar.idle"), weight: 5 });
    if (mind.travel === "driving") cands.push({ text: t("nar.driving"), weight: 7 });
    else if (mind.travel === "walking") cands.push({ text: t("nar.walking"), weight: 4 });
    if (weatherActive) cands.push({ text: t("nar.weather", { w: t(`weather.${env.weather.kind}`) }), weight: 5 });
    const favs = mind.favorites();
    if (favs.length && Math.abs(Math.sin(seed * 2.3)) > 0.6) cands.push({ text: t("nar.returning", { fav: t(`cat.${favs[0]}`) }), weight: 4 });
    cands.push({ text: t("nar.phase", { p: t(`phase.${phaseOf(env.now)}`) }), weight: 2 });
    if (env.city) cands.push({ text: t("nar.sync", { city: env.city }), weight: 1 });

    const scored = cands.map((c, i) => ({ c, s: c.weight * (0.6 + 0.8 * Math.abs(Math.sin(seed * 1.7 + i))) }));
    scored.sort((a, b) => b.s - a.s);
    return scored[0]?.c.text ?? "";
  };

  // first words + steady cadence; rebuilds when language or context shifts so the
  // voice always speaks the current language (the closure captures the live t)
  useEffect(() => {
    const first = setTimeout(() => setLine(compose((seedRef.current += 0.91))), 500);
    const id = setInterval(() => setLine(compose((seedRef.current += 1.618))), 14000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full ee-breathe align-middle" style={{ background: "var(--ee-accent)", boxShadow: "0 0 10px var(--ee-accent)" }} />
            {line}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
