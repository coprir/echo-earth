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
import { useT } from "@/lib/i18n";
import LangSwitcher from "@/components/i18n/LangSwitcher";

export default function VitalsHUD({ env, theme, travel, onAbout }: { env: EnvSignals; theme: Theme; travel: TravelMode; onAbout: () => void }) {
  const [sound, setSound] = useState(false);
  const { t } = useT();

  const toggleSound = () => {
    if (sound) ambient.stop();
    else ambient.start(theme.audioMood);
    setSound(!sound);
  };

  const vitals: string[] = [
    env.city ? `${env.city}${env.country ? ", " + env.country : ""}` : t("hud.locating"),
    `${t(`weather.${env.weather.kind}`)}${env.weather.tempC != null ? ` ${env.weather.tempC}°` : ""}`,
    `${t(`phase.${theme.phase}`)} · ${t(`season.${theme.season}`)}`,
    travel !== "still" ? t(`travel.${travel}`) : null,
    env.batteryLevel != null ? `⚡ ${Math.round(env.batteryLevel * 100)}%` : null,
    env.netSpeed !== "unknown" ? t(`net.${env.netSpeed}`) : null,
  ].filter(Boolean) as string[];

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 1 }}
      className="fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 py-3 pointer-events-none"
    >
      <div className="flex items-center gap-3 shrink-0 pointer-events-auto">
        <span className="ee-breathe inline-block w-3 h-3 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 14px var(--ee-glow)" }} aria-hidden />
        <div>
          <p className="text-[11px] font-medium tracking-[0.35em] uppercase ee-glow-text">echo earth</p>
          <p className="text-[10px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
            {t("hud.mood")}: {theme.label.toLowerCase()}
          </p>
        </div>
      </div>

      {/* sensor readout — shown identically on every device; scrolls on narrow screens */}
      <ul
        className="flex flex-1 min-w-0 justify-end gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pointer-events-auto"
        aria-label={t("hud.senses")}
      >
        {vitals.map((v) => (
          <li key={v} className="ee-glass shrink-0 px-2.5 py-1 !rounded-full text-[10px] tracking-wider whitespace-nowrap" style={{ color: "var(--ee-text-dim)" }}>
            {v}
          </li>
        ))}
      </ul>

      <LangSwitcher />

      <button
        onClick={onAbout}
        aria-label={t("hud.about")}
        className="ee-glass shrink-0 !rounded-full w-8 h-8 grid place-items-center text-xs pointer-events-auto"
        style={{ color: "var(--ee-text-dim)" }}
      >
        ?
      </button>

      <button
        onClick={toggleSound}
        aria-pressed={sound}
        aria-label={sound ? t("hud.sound.off") : t("hud.sound.on")}
        className="ee-glass shrink-0 !rounded-full w-8 h-8 grid place-items-center text-xs pointer-events-auto"
        style={{ color: sound ? "var(--ee-accent)" : "var(--ee-text-dim)" }}
      >
        {sound ? "◉" : "◎"}
      </button>
    </motion.header>
  );
}
