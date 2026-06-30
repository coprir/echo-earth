"use client";

/**
 * PlanetaryEntry — the cinematic boot ritual at planetary scale.
 *
 * Earth fades in from the dark, locates the visitor, speaks a few planetary
 * lines, then dives from orbit down into their local district — handing off to
 * the neural map. Replaces the old "eye" awakening with the core promise:
 * Earth itself finding and greeting the human.
 */

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { EnvSignals, Theme } from "@/engine/environment";
import { useT } from "@/lib/i18n";

const LivingEarth = dynamic(() => import("./LivingEarth"), { ssr: false });

export default function PlanetaryEntry({ env, theme, onDone }: { env: EnvSignals; theme: Theme; onDone: () => void }) {
  const { t } = useT();
  const [stage, setStage] = useState(0);
  const [diving, setDiving] = useState(false);
  const [gone, setGone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const lines = [
    t("entry.locating"),
    env.city ? t("entry.presence", { city: env.city }) : t("entry.presence.generic"),
    theme.label === "Survival Mode" ? t("entry.survival") : t("entry.mood", { mood: theme.label.toLowerCase() }),
    t("entry.sync"),
  ];

  useEffect(() => {
    const reduced = env.prefersReducedMotion;
    const t = [
      setTimeout(() => setStage(1), reduced ? 400 : 1200),
      setTimeout(() => setStage(2), reduced ? 900 : 2800),
      setTimeout(() => setStage(3), reduced ? 1500 : 4400),
      setTimeout(() => setDiving(true), reduced ? 1900 : 5600),
      // safety net: if the dive's onArrive never fires, finish anyway
      setTimeout(() => arrive(), reduced ? 3200 : 11000),
    ];
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arrivedRef = useRef(false);
  const arrive = () => {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    setGone(true);
    setTimeout(() => onDoneRef.current(), 900);
  };

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          className="fixed inset-0 z-50"
          style={{ background: "var(--ee-bg-deep)" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(14px)" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <LivingEarth lat={env.lat} lon={env.lon} diving={diving} reducedMotion={env.prefersReducedMotion} onArrive={arrive} />
          </motion.div>

          {/* planetary narration */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[14vh] flex flex-col items-center gap-2 px-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.5em]" style={{ color: "var(--ee-text-dim)" }}>
              {t("entry.kicker")}
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={stage}
                initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
                transition={{ duration: 0.9 }}
                className="max-w-md text-lg font-light"
                style={{ color: "var(--ee-text)", textShadow: "0 0 28px var(--ee-glow)" }}
              >
                {lines[stage]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
