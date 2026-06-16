"use client";

/**
 * About — "what is this?" An in-voice introduction to ECHO EARTH, shown in the
 * same glass language as the concierge. Opt-in via the HUD "?"; never auto-opens
 * (the planet entry + concierge already carry the cinematic first impression).
 */

import { AnimatePresence, motion } from "framer-motion";

const SECTIONS: { h: string; b: string }[] = [
  {
    h: "a living planet that finds you",
    b: "Echo Earth opens as a cinematic 3D Earth that locates you by your real position — the day and night sides lit by the actual sun — then dives from orbit into your city, drawn as a living neural map where nearby places pulse around you.",
  },
  {
    h: "it senses your world",
    b: "It reads your location, live weather, season, time of day, device and battery, and reshapes its colour, motion, particles and sound to match. Rain, nightfall, summer, your city — each grows a different mood. No two visitors see quite the same thing.",
  },
  {
    h: "an ambient intelligence speaks",
    b: "A quiet voice — the City Consciousness — narrates what it notices, reacting to the weather and how you move. Switch the Atmosphere on the left to bend the whole world into Neon Storm, Golden Sunset, Cyber Rain and more.",
  },
  {
    h: "the concierge moves you through the city",
    b: "Tap ✦ and tell it the energy you're after — calm, social, romantic, underground, luxurious, productive or chaotic. It composes a personalised route through real nearby places, sequenced for how a night actually flows. Tap any stop to fly there.",
  },
  {
    h: "it remembers you",
    b: "The more you explore, the more it learns your taste — and grows a little more personal each time you return.",
  },
];

export default function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "color-mix(in oklab, var(--ee-bg-deep) 55%, transparent)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="What is Echo Earth"
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
                  echo earth
                </p>
                <h2 className="mt-1 text-lg font-light ee-glow-text" style={{ color: "var(--ee-text)" }}>
                  the city, listening back
                </h2>
              </div>
              <button onClick={onClose} aria-label="Close" className="shrink-0 grid h-7 w-7 place-items-center rounded-full text-xs" style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}>
                ✕
              </button>
            </div>

            <p className="mt-4 text-sm font-light leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
              Not a map app — an emotionally adaptive city companion for tourists and locals. It makes finding where to go feel like the planet itself is guiding you.
            </p>

            <div className="mt-5 space-y-4">
              {SECTIONS.map((s) => (
                <div key={s.h}>
                  <h3 className="flex items-center gap-2 text-sm" style={{ color: "var(--ee-text)" }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 8px var(--ee-glow)" }} />
                    {s.h}
                  </h3>
                  <p className="mt-1 text-[13px] font-light leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
                    {s.b}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl py-2.5 text-sm transition-transform active:scale-95"
              style={{ background: "var(--ee-accent)", color: "var(--ee-bg-deep)", boxShadow: "0 0 20px var(--ee-glow)" }}
            >
              begin exploring
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
