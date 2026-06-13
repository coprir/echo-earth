"use client";

/**
 * Consciousness — the visible voice of the City Consciousness AI.
 *
 * A single line of poetic narration that fades in, lingers, and dissolves,
 * recomposing itself from the live Observation every ~14s (sooner if the
 * context shifts sharply — weather change, mode switch, going idle). The tone
 * tints the glow so the words feel emotionally colored, not just informational.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { EnvSignals } from "@/engine/environment";
import { compose, greeting, Observation, Thought } from "@/engine/consciousness";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";

const TONE_COLOR: Record<Thought["tone"], string> = {
  calm: "hsl(165, 70%, 72%)",
  curious: "hsl(48, 90%, 72%)",
  electric: "hsl(305, 90%, 75%)",
  tender: "hsl(20, 85%, 75%)",
  mysterious: "var(--ee-accent)",
};

export default function Consciousness({
  env,
  category,
  placeCount,
}: {
  env: EnvSignals;
  category: string;
  placeCount: number;
}) {
  const mind = useAdaptiveMind();
  const [thought, setThought] = useState<Thought | null>(null);
  const seedRef = useRef(env.visitorSeed * 1000);
  const lastTouchRef = useRef(Date.now());

  // track idleness from any interaction
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

  const observe = (): Observation => ({
    env,
    atmosphere: mind.atmosphere,
    travel: mind.travel,
    mode: mind.mode,
    energy: env.motionEnergy,
    favorites: mind.favorites(),
    category,
    idleMs: Date.now() - lastTouchRef.current,
    placeCount,
  });

  // first words
  useEffect(() => {
    const t = setTimeout(() => setThought(greeting(observe())), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recompose on a gentle cadence
  useEffect(() => {
    const id = setInterval(() => {
      seedRef.current += 1.618;
      setThought(compose(observe(), seedRef.current));
    }, 14000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // react quickly when context shifts sharply
  useEffect(() => {
    seedRef.current += 0.91;
    const t = setTimeout(() => setThought(compose(observe(), seedRef.current)), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.weather.kind, mind.mode, mind.atmosphere, mind.travel]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-20 flex justify-center px-6" aria-live="polite">
      <AnimatePresence mode="wait">
        {thought && (
          <motion.p
            key={thought.text}
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[34rem] text-center text-[0.95rem] font-light leading-relaxed tracking-wide"
            style={{ color: "var(--ee-text)", textShadow: `0 0 28px ${TONE_COLOR[thought.tone]}` }}
          >
            <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full ee-breathe align-middle" style={{ background: TONE_COLOR[thought.tone], boxShadow: `0 0 10px ${TONE_COLOR[thought.tone]}` }} />
            {thought.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
