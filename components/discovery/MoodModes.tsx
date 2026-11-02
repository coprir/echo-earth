"use client";

/**
 * MoodModes — the organism's lenses: Late Night, Rainy Day, Cheap Eats,
 * Luxury, Hidden Gems. Picking one re-tunes the whole discovery field.
 */

import { motion } from "framer-motion";
import type { MoodMode } from "@/engine/useAdaptiveMind";
import { useT } from "@/lib/i18n";

const MODES: MoodMode[] = ["explore", "latenight", "rainyday", "cheapeats", "luxury", "hiddengems"];

export default function MoodModes({ active, onPick }: { active: MoodMode; onPick: (m: MoodMode) => void }) {
  const { t } = useT();
  return (
    <div role="radiogroup" aria-label={t("mode.aria")} className="ee-scroll-x flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {MODES.map((m) => {
        const isActive = m === active;
        return (
          <motion.button
            key={m}
            role="radio"
            aria-checked={isActive}
            onClick={() => onPick(m)}
            whileTap={{ scale: 0.95 }}
            // min-h-11 == 44px: the lens pills were ~26px tall, under the
            // minimum comfortable touch target, and they sit at the very
            // bottom of the viewport where thumb accuracy is worst
            className="shrink-0 grid place-items-center min-h-11 px-4 py-1 rounded-full text-[11px] uppercase tracking-[0.18em] transition-all"
            style={{
              color: isActive ? "var(--ee-on-accent)" : "var(--ee-text-dim)",
              background: isActive ? "var(--ee-accent-solid)" : "transparent",
              border: `1px solid ${isActive ? "var(--ee-accent-solid)" : "var(--ee-line)"}`,
              boxShadow: isActive ? "0 0 18px var(--ee-glow)" : "none",
            }}
          >
            {t(`mode.${m}`)}
          </motion.button>
        );
      })}
    </div>
  );
}
