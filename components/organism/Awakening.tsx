"use client";

/**
 * Awakening — the boot ritual. The organism opens its eye, senses the visitor,
 * and names what it found before dissolving into the living interface.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EnvSignals, Theme } from "@/engine/environment";

export default function Awakening({ env, theme, onDone }: { env: EnvSignals; theme: Theme; onDone: () => void }) {
  const [stage, setStage] = useState(0);

  const senses = useMemo(() => {
    const lines: string[] = [];
    if (env.city) lines.push(`a presence near ${env.city}`);
    else if (env.lat != null) lines.push("a presence on the surface");
    else lines.push("a new presence");
    if (env.weather.kind !== "unknown") lines.push(`${env.weather.kind} skies, ${env.weather.tempC ?? "–"}°`);
    lines.push(`${theme.phase} · ${theme.season}`);
    lines.push(`mood forming: ${theme.label.toLowerCase()}`);
    return lines;
  }, [env, theme]);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 900),
      setTimeout(() => setStage(2), 2100),
      setTimeout(() => setStage(3), 4400),
      setTimeout(() => onDoneRef.current(), 5600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <AnimatePresence>
      {stage < 3 && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: "var(--ee-bg-deep)" }}
          exit={{ opacity: 0, scale: 1.06, filter: "blur(12px)" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* the eye */}
          <motion.div
            className="rounded-full"
            initial={{ width: 6, height: 6, opacity: 0 }}
            animate={{
              width: stage >= 1 ? 140 : 6,
              height: stage >= 1 ? 140 : 6,
              opacity: 1,
              boxShadow: `0 0 ${stage >= 1 ? 120 : 20}px var(--ee-glow), inset 0 0 40px var(--ee-glow)`,
            }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ border: "1px solid var(--ee-line)", background: "radial-gradient(circle, var(--ee-glow), transparent 70%)" }}
          />
          <motion.p
            className="mt-10 text-xs tracking-[0.5em] uppercase"
            style={{ color: "var(--ee-text-dim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: stage >= 1 ? 1 : 0 }}
          >
            echo earth is waking
          </motion.p>
          <div className="mt-6 h-24 flex flex-col items-center gap-1.5">
            {stage >= 2 &&
              senses.map((line, i) => (
                <motion.span
                  key={line}
                  className="text-sm font-light"
                  style={{ color: "var(--ee-text)" }}
                  initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                  animate={{ opacity: 0.9, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: i * 0.45, duration: 0.7 }}
                >
                  {line}
                </motion.span>
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
