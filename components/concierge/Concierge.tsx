"use client";

/**
 * Concierge — the AI City Concierge.
 *
 * Opens with the emotionally-intelligent question ("what energy are you looking
 * for tonight?"), then composes a personalized *movement journey* from real
 * nearby places — an ordered route with connective narration. Picking an energy
 * re-skins the whole organism (atmosphere) and re-tunes discovery (mode).
 * Tapping a stop flies the neural map to it.
 *
 * Auto-opens once per session as the cinematic entry; reopenable via its orb.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CategoryId, Place } from "@/lib/places";
import { ENERGIES, Energy, Journey, composeJourney, energyCategories, stopIcon } from "@/lib/itinerary";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";
import { useT } from "@/lib/i18n";

type Step = "intent" | "loading" | "journey";

export default function Concierge({ lat, lon, city, onFocusPlace, autoOpen = true }: { lat: number | null; lon: number | null; city: string | null; onFocusPlace: (p: Place) => void; autoOpen?: boolean }) {
  const mind = useAdaptiveMind();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intent");
  const [local, setLocal] = useState(true); // live like a local vs explore like a tourist
  const [journey, setJourney] = useState<Journey | null>(null);
  const [energy, setEnergyState] = useState<Energy | null>(null);
  const offsetRef = useRef(0);

  // auto-open once per browser session — but only after the intro has finished
  // (autoOpen flips true when the About panel is dismissed / already seen)
  useEffect(() => {
    if (!autoOpen) return;
    let seen = true;
    try {
      seen = sessionStorage.getItem("ee-concierge-seen") === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem("ee-concierge-seen", "1");
      } catch {}
    }, 900);
    return () => clearTimeout(t);
  }, [autoOpen]);

  async function generate(e: Energy, offset = 0) {
    setEnergyState(e);
    const m = useAdaptiveMind.getState();
    const def = ENERGIES.find((x) => x.id === e)!;
    // picking an energy re-skins + re-tunes the organism
    m.setEnergy(e);
    m.setAtmosphere(def.atmosphere);
    m.setMode(def.mode);
    setStep("loading");

    const cats = energyCategories(e);
    const byCat: Partial<Record<CategoryId, Place[]>> = {};
    if (lat != null && lon != null) {
      await Promise.all(
        cats.map(async (c) => {
          try {
            const r = await fetch(`/api/places?lat=${lat}&lon=${lon}&category=${c}`);
            const d = await r.json();
            byCat[c] = d.places ?? [];
          } catch {
            byCat[c] = [];
          }
        })
      );
    }
    // tourists get the headline spots; locals get a little deeper into the pool
    setJourney(composeJourney(e, byCat, offset + (local ? 1 : 0)));
    setStep("journey");
  }

  const close = () => setOpen(false);
  const tapStop = (p: Place) => {
    onFocusPlace(p);
    setOpen(false);
  };

  return (
    <>
      {/* concierge orb — reopen anytime */}
      <button
        onClick={() => {
          setOpen(true);
          if (!journey) setStep("intent");
        }}
        aria-label={t("con.open")}
        title={t("con.title")}
        className="ee-glass ee-pulse fixed right-3 bottom-40 z-30 grid h-12 w-12 place-items-center !rounded-full text-lg pointer-events-auto"
        style={{ color: "var(--ee-accent)" }}
      >
        <span className="ee-breathe" aria-hidden>✦</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: "color-mix(in oklab, var(--ee-bg-deep) 55%, transparent)", backdropFilter: "blur(8px)" }}
            onClick={close}
          >
            <motion.div
              role="dialog"
              aria-label={t("con.title")}
              onClick={(e) => e.stopPropagation()}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="ee-glass w-full max-w-lg max-h-[82vh] overflow-y-auto p-6"
            >
              {/* header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.4em]" style={{ color: "var(--ee-text-dim)" }}>
                    {t("con.kicker")}
                  </p>
                  <h2 className="mt-1 text-lg font-light ee-glow-text" style={{ color: "var(--ee-text)" }}>
                    {step === "journey" && energy ? t(`journey.${energy}.title`) : t("con.question")}
                  </h2>
                </div>
                <button onClick={close} aria-label={t("con.close")} className="rounded-full w-7 h-7 grid place-items-center text-xs shrink-0" style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}>
                  ✕
                </button>
              </div>

              {/* INTENT */}
              {step === "intent" && (
                <div className="mt-5">
                  <div className="grid grid-cols-2 gap-2">
                    {ENERGIES.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => generate(e.id)}
                        className="group flex flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left transition-transform active:scale-95"
                        style={{ background: "var(--ee-surface)", border: "1px solid var(--ee-line)" }}
                      >
                        <span className="text-base" style={{ color: "var(--ee-accent)" }}>
                          {e.glyph} <span className="text-sm" style={{ color: "var(--ee-text)" }}>{t(`energy.${e.id}.label`)}</span>
                        </span>
                        <span className="text-[11px] italic leading-snug" style={{ color: "var(--ee-text-dim)" }}>
                          {t(`energy.${e.id}.q`)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* tourist vs local */}
                  <div className="mt-4 flex items-center gap-2" role="radiogroup" aria-label={t("con.style")}>
                    {[
                      { v: false, label: t("con.tourist") },
                      { v: true, label: t("con.local") },
                    ].map((o) => (
                      <button
                        key={String(o.v)}
                        role="radio"
                        aria-checked={local === o.v}
                        onClick={() => setLocal(o.v)}
                        className="flex-1 rounded-full px-3 py-2 text-[11px] tracking-wide transition-colors"
                        style={{
                          color: local === o.v ? "var(--ee-bg-deep)" : "var(--ee-text-dim)",
                          background: local === o.v ? "var(--ee-accent)" : "transparent",
                          border: `1px solid ${local === o.v ? "var(--ee-accent)" : "var(--ee-line)"}`,
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* LOADING */}
              {step === "loading" && (
                <div className="mt-10 flex flex-col items-center gap-3 py-8">
                  <span className="h-3 w-3 rounded-full ee-breathe" style={{ background: "var(--ee-accent)", boxShadow: "0 0 16px var(--ee-glow)" }} />
                  <p className="text-sm animate-pulse" style={{ color: "var(--ee-text-dim)" }}>
                    {t("con.loading", { city: city ?? t("hud.locating") })}
                  </p>
                </div>
              )}

              {/* JOURNEY */}
              {step === "journey" && journey && (
                <div className="mt-4">
                  <p className="text-sm font-light leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
                    {journey.stops.length
                      ? t("con.whisper", { city: city ?? "—", n: journey.stops.length, lead: journey.stops[0].place.name })
                      : t("con.empty")}
                  </p>

                  <ol className="mt-5 space-y-2.5">
                    {journey.stops.map((s) => (
                      <li key={s.place.id}>
                        <button
                          onClick={() => tapStop(s.place)}
                          className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-transform active:scale-[0.98]"
                          style={{ background: "var(--ee-surface)", border: "1px solid var(--ee-line)" }}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm" style={{ background: "var(--ee-glow)", color: "var(--ee-text)" }}>
                            {s.index}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ee-text)" }}>
                              <span aria-hidden>{stopIcon(s.place.category)}</span>
                              <span className="truncate">{s.place.name}</span>
                              {s.place.isGem && <span className="text-[10px] text-yellow-200/80">✦</span>}
                            </span>
                            <span className="block text-[11px] italic leading-snug" style={{ color: "var(--ee-text-dim)" }}>
                              {energy ? t(`journey.${energy}.${s.stepKey}`) : s.note}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-[10px] tracking-wide" style={{ color: "var(--ee-text-dim)" }}>
                            {(s.place.distanceM / 1000).toFixed(1)}km
                            <br />★ {s.place.rating.toFixed(1)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => energy && generate(energy, (offsetRef.current += 2))}
                      className="flex-1 rounded-xl py-2.5 text-sm transition-transform active:scale-95"
                      style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}
                    >
                      {t("con.regen")}
                    </button>
                    <button
                      onClick={() => {
                        offsetRef.current = 0;
                        setStep("intent");
                      }}
                      className="flex-1 rounded-xl py-2.5 text-sm transition-transform active:scale-95"
                      style={{ background: "var(--ee-accent)", color: "var(--ee-bg-deep)", boxShadow: "0 0 20px var(--ee-glow)" }}
                    >
                      {t("con.change")}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
