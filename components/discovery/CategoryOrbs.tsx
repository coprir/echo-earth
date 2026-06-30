"use client";

/**
 * CategoryOrbs — the category picker as a horizontal strand of living cells.
 * Order is decided by the recommendation cortex, so the strand visibly
 * re-sequences itself as context (mode, weather, movement) changes.
 */

import { motion } from "framer-motion";
import type { Category, CategoryId } from "@/lib/places";
import { useT } from "@/lib/i18n";

interface Props {
  categories: Category[];
  active: CategoryId;
  onPick: (id: CategoryId) => void;
}

export default function CategoryOrbs({ categories, active, onPick }: Props) {
  const { t } = useT();
  return (
    <nav aria-label={t("cat.aria")} className="flex gap-2.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((c, i) => {
        const isActive = c.id === active;
        return (
          <motion.button
            key={c.id}
            layout
            onClick={() => onPick(c.id)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ layout: { type: "spring", stiffness: 320, damping: 28 }, delay: i * 0.03 }}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.94 }}
            aria-pressed={isActive}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${isActive ? "ee-pulse" : ""}`}
            style={{
              background: isActive ? `hsla(${c.hue}, 80%, 60%, 0.22)` : "var(--ee-surface)",
              border: `1px solid ${isActive ? `hsla(${c.hue}, 85%, 65%, 0.8)` : "var(--ee-line)"}`,
              color: isActive ? `hsl(${c.hue}, 70%, 80%)` : "var(--ee-text-dim)",
              backdropFilter: "blur(var(--ee-blur))",
            }}
          >
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full ee-breathe"
              style={{ background: `hsl(${c.hue}, 90%, 65%)`, boxShadow: `0 0 8px hsl(${c.hue}, 90%, 65%)` }}
            />
            {t(`cat.${c.id}`)}
          </motion.button>
        );
      })}
    </nav>
  );
}
