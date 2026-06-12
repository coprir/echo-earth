"use client";

/**
 * VitalsHUD — the organism shows what it senses: place, weather, mood,
 * battery, network, travel mode. Doubles as the transparency layer —
 * the visitor always knows what the organism is reading.
 */

import { motion } from "framer-motion";
import type { EnvSignals, Theme } from "@/engine/environment";
import type { TravelMode } from "@/engine/useAdaptiveMind";
import { ambient } from "@/engine/audio";
import { useState } from "react";

export default function VitalsHUD({ env, theme, travel }: { env: EnvSignals; theme: Theme; travel: TravelMode }) {
  const [sound, setSound] = useState(false);

  const toggleSound = () => {
    if (sound) ambient.stop();
    else ambient.start(theme.audioMood);
    setSound(!sound);
  };

  const vitals: string[] = [
    env.city ? `${env.city}${env.country ? ", " + env.country : ""}` : "locating…",
    `${env.weather.kind}${env.weather.tempC != null ? ` ${env.weather.tempC}°` : ""}`,
    `${theme.phase} · ${theme.season}`,
    travel !== "still" ? travel : null,
    env.batteryLevel != null ? `⚡ ${Math.round(env.batteryLevel * 100)}%` : null,
    env.netSpeed !== "unknown" ? `net ${env.netSpeed}` : null,
  ].filter(Boolean) as string[];

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 1 }}
      className="fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 pointer-events-none"
    >
      <div className="flex items-center gap-3 pointer-events-auto">
        <span className="ee-breathe inline-block w-3 h-3 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 14px var(--ee-glow)" }} aria-hidden />
        <div>
          <p className="text-[11px] font-medium tracking-[0.35em] uppercase ee-glow-text">echo earth</p>
          <p className="text-[10px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
            mood: {theme.label.toLowerCase()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pointer-events-auto">
        <ul className="hidden sm:flex gap-2" aria-label="What the organism senses">
          {vitals.map((v) => (
            <li key={v} className="ee-glass px-2.5 py-1 !rounded-full text-[10px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
              {v}
            </li>
          ))}
        </ul>
        <button
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label={sound ? "Mute ambient sound" : "Enable ambient sound"}
          className="ee-glass !rounded-full w-8 h-8 grid place-items-center text-xs"
          style={{ color: sound ? "var(--ee-accent)" : "var(--ee-text-dim)" }}
        >
          {sound ? "◉" : "◎"}
        </button>
      </div>
    </motion.header>
  );
}
