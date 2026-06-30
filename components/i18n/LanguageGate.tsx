"use client";

/**
 * LanguageGate — the very first thing a visitor sees.
 *
 * A cinematic full-screen language chooser shown before the planet awakens.
 * The location-detected language is highlighted as the suggestion; choosing any
 * language sets it (manually, overriding auto-detect), persists, and reveals the
 * experience. Shown once per browser — returning visitors go straight in.
 */

import { motion } from "framer-motion";
import { LANGS, useLang } from "@/lib/i18n";

export default function LanguageGate({ onDone }: { onDone: () => void }) {
  const lang = useLang((s) => s.lang); // the auto-detected suggestion
  const setLang = useLang((s) => s.setLang);

  const choose = (code: (typeof LANGS)[number]["code"]) => {
    setLang(code);
    try {
      localStorage.setItem("ee-lang-chosen", "1");
    } catch {}
    onDone();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6"
      style={{ background: "radial-gradient(120% 120% at 50% 0%, var(--ee-bg) 0%, var(--ee-bg-deep) 100%)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <span className="ee-breathe inline-block h-3 w-3 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 18px var(--ee-glow)" }} aria-hidden />
        <h1 className="mt-6 text-sm font-medium uppercase tracking-[0.5em] ee-glow-text" style={{ color: "var(--ee-text)" }}>
          echo earth
        </h1>
        {/* "choose your language" in every supported tongue, so it's clear before a language is picked */}
        <p className="mt-3 max-w-md text-center text-[11px] tracking-wide" style={{ color: "var(--ee-text-dim)" }} dir="auto">
          Choose your language · اختر لغتك · Choisissez votre langue · 选择你的语言 · Elige tu idioma · Выберите язык · Επιλέξτε γλώσσα · Dilinizi seçin · Sprache wählen
        </p>
      </motion.div>

      <motion.div
        role="listbox"
        aria-label="Choose your language"
        className="mt-9 grid w-full max-w-md grid-cols-2 gap-2.5 sm:grid-cols-3"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      >
        {LANGS.map((l) => {
          const suggested = l.code === lang;
          return (
            <motion.button
              key={l.code}
              role="option"
              aria-selected={suggested}
              dir={l.dir}
              onClick={() => choose(l.code)}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              className="ee-glass flex items-center justify-center gap-2 !rounded-2xl px-4 py-3.5 text-base transition-colors"
              style={{
                color: suggested ? "var(--ee-text)" : "var(--ee-text-dim)",
                border: `1px solid ${suggested ? "var(--ee-accent)" : "var(--ee-line)"}`,
                boxShadow: suggested ? "0 0 22px var(--ee-glow)" : "none",
              }}
            >
              {l.label}
            </motion.button>
          );
        })}
      </motion.div>

      <p className="mt-7 text-[10px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
        ⌖ you can change this anytime
      </p>
    </motion.div>
  );
}
