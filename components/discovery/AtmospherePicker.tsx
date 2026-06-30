"use client";

/**
 * AtmospherePicker — the Digital Weather System control.
 *
 * Lets the visitor override the organism's natural mood with a synthetic
 * emotional atmosphere (Dream, Neon Storm, Cyber Rain, Aurora…). Collapsed to
 * a single glyph by default so it never clutters; expands into a radial-feeling
 * vertical menu. Picking one re-skins the entire organism instantly.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ATMOSPHERES } from "@/engine/environment";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";
import { useT } from "@/lib/i18n";

export default function AtmospherePicker() {
  const atmosphere = useAdaptiveMind((s) => s.atmosphere);
  const setAtmosphere = useAdaptiveMind((s) => s.setAtmosphere);
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-start gap-2">
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="ee-glass flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto p-2"
            aria-label={t("atmo.title")}
          >
            {ATMOSPHERES.map((a) => {
              const active = a.id === atmosphere;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      setAtmosphere(a.id);
                      setOpen(false);
                    }}
                    aria-pressed={active}
                    className="group flex w-full flex-col items-start rounded-xl px-3 py-1.5 text-left transition-colors"
                    style={{ background: active ? "var(--ee-glow)" : "transparent" }}
                  >
                    <span className="text-sm" style={{ color: active ? "var(--ee-text)" : "var(--ee-text-dim)" }}>
                      {t(`atmo.${a.id}.label`)}
                    </span>
                    <span className="text-[10px] italic opacity-70" style={{ color: "var(--ee-text-dim)" }}>
                      {t(`atmo.${a.id}.whisper`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${t(`atmo.${atmosphere}.label`)} — ${t("atmo.change")}`}
        className="ee-glass ee-pulse flex items-center gap-2 !rounded-full px-3 py-2"
        style={{ color: "var(--ee-text)" }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full ee-breathe" style={{ background: "var(--ee-accent)", boxShadow: "0 0 12px var(--ee-glow)" }} />
        <span className="text-xs tracking-wider">{t(`atmo.${atmosphere}.label`)}</span>
      </button>
    </div>
  );
}
