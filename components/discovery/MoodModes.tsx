"use client";

/**
 * MoodModes — the organism's lenses: Late Night, Rainy Day, Cheap Eats,
 * Luxury, Hidden Gems. Picking one re-tunes the whole discovery field.
 */

import { motion } from "framer-motion";
import { MODE_META } from "@/lib/recommend";
import type { MoodMode } from "@/engine/useAdaptiveMind";

const MODES: MoodMode[] = ["explore", "latenight", "rainyday", "cheapeats", "luxury", "hiddengems"];

export default function MoodModes({ active, onPick }: { active: MoodMode; onPick: (m: MoodMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Discovery mood" className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {MODES.map((m) => {
        const isActive = m === active;
        return (
          <motion.button
            key={m}
            role="radio"
            aria-checked={isActive}
            onClick={() => onPick(m)}
            whileTap={{ scale: 0.95 }}
            className="shrink-0 px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.18em] transition-all"
            style={{
              color: isActive ? "var(--ee-bg-deep)" : "var(--ee-text-dim)",
              background: isActive ? "var(--ee-accent)" : "transparent",
              border: `1px solid ${isActive ? "var(--ee-accent)" : "var(--ee-line)"}`,
              boxShadow: isActive ? "0 0 18px var(--ee-glow)" : "none",
            }}
          >
            {MODE_META[m].label}
          </motion.button>
        );
      })}
    </div>
  );
}
