"use client";

/**
 * HudMenu — one dropdown that consolidates every top-right control:
 * Intelligence, About, ambient sound toggle, and the full language list.
 * Replaces the row of separate icon buttons with a single ⋯ menu.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { LANGS, useLang, useT } from "@/lib/i18n";
import { ambient } from "@/engine/audio";
import type { Theme } from "@/engine/environment";

export default function HudMenu({ onAbout, audioMood }: { onAbout: () => void; audioMood: Theme["audioMood"] }) {
  const { t } = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(false);

  const toggleSound = () => {
    if (sound) ambient.stop();
    else ambient.start(audioMood);
    setSound(!sound);
  };

  const rowStyle = "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors";

  return (
    <div className="relative shrink-0 pointer-events-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("hud.menu")}
        aria-expanded={open}
        className="ee-glass !rounded-full w-9 h-9 grid place-items-center text-base"
        style={{ color: "var(--ee-text-dim)" }}
      >
        ⋯
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="ee-glass absolute end-0 z-50 mt-2 w-56 overflow-hidden p-1.5"
              role="menu"
            >
              <button
                role="menuitem"
                onClick={() => {
                  onAbout();
                  setOpen(false);
                }}
                className={rowStyle}
                style={{ color: "var(--ee-text)" }}
              >
                <span>{t("hud.about")}</span>
                <span style={{ color: "var(--ee-text-dim)" }}>?</span>
              </button>

              <button role="menuitem" onClick={toggleSound} aria-pressed={sound} className={rowStyle} style={{ color: "var(--ee-text)" }}>
                <span>{t("hud.sound")}</span>
                <span style={{ color: sound ? "var(--ee-accent)" : "var(--ee-text-dim)" }}>{sound ? "◉" : "◎"}</span>
              </button>

              <div className="my-1.5 h-px" style={{ background: "var(--ee-line)" }} />

              <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--ee-text-dim)" }}>
                {t("hud.lang")}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {LANGS.map((l) => {
                  const active = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      role="menuitemradio"
                      aria-checked={active}
                      dir={l.dir}
                      onClick={() => {
                        setLang(l.code);
                        setOpen(false);
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors"
                      style={{ background: active ? "var(--ee-glow)" : "transparent", color: active ? "var(--ee-text)" : "var(--ee-text-dim)" }}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
