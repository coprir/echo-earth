"use client";

/**
 * About — "what is this?" An in-voice introduction to ECHO EARTH, fully
 * translated. Shown in the same glass language as the concierge.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";

export default function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const sections = ["s1", "s2", "s3", "s4", "s5"];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "color-mix(in oklab, var(--ee-bg-deep) 55%, transparent)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label={t("hud.about")}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="ee-glass w-full max-w-lg max-h-[82vh] overflow-y-auto p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.4em]" style={{ color: "var(--ee-text-dim)" }}>
                  {t("about.kicker")}
                </p>
                <h2 className="mt-1 text-lg font-light ee-glow-text" style={{ color: "var(--ee-text)" }}>
                  {t("about.title")}
                </h2>
              </div>
              <button onClick={onClose} aria-label={t("about.close")} className="shrink-0 grid h-7 w-7 place-items-center rounded-full text-xs" style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}>
                ✕
              </button>
            </div>

            <p className="mt-4 text-sm font-light leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
              {t("about.intro")}
            </p>

            <div className="mt-5 space-y-4">
              {sections.map((s) => (
                <div key={s}>
                  <h3 className="flex items-center gap-2 text-sm" style={{ color: "var(--ee-text)" }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 8px var(--ee-glow)" }} />
                    {t(`about.${s}.h`)}
                  </h3>
                  <p className="mt-1 text-[13px] font-light leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
                    {t(`about.${s}.b`)}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl py-2.5 text-sm transition-transform active:scale-95"
              style={{ background: "var(--ee-accent)", color: "var(--ee-bg-deep)", boxShadow: "0 0 20px var(--ee-glow)" }}
            >
              {t("about.cta")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
