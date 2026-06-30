"use client";

/**
 * LangSwitcher — a compact globe button that opens the language list.
 * Choosing a language sets it manually (overriding location auto-detect) and
 * persists; Arabic flips the document to RTL via the layout effect in page.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { LANGS, useLang, useT } from "@/lib/i18n";

export default function LangSwitcher() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0 pointer-events-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("hud.lang")}
        aria-expanded={open}
        className="ee-glass !rounded-full w-8 h-8 grid place-items-center text-xs"
        style={{ color: "var(--ee-text-dim)" }}
      >
        ⌖
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <motion.ul
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="ee-glass absolute end-0 z-50 mt-2 w-40 overflow-hidden p-1"
              aria-label={t("hud.lang")}
            >
              {LANGS.map((l) => {
                const active = l.code === lang;
                return (
                  <li key={l.code}>
                    <button
                      onClick={() => {
                        setLang(l.code);
                        setOpen(false);
                      }}
                      aria-pressed={active}
                      dir={l.dir}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors"
                      style={{ background: active ? "var(--ee-glow)" : "transparent", color: active ? "var(--ee-text)" : "var(--ee-text-dim)" }}
                    >
                      {l.label}
                      {active && <span style={{ color: "var(--ee-accent)" }}>●</span>}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
