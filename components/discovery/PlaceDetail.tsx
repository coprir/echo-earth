"use client";

/**
 * PlaceDetail — when a neuron is touched, it unfolds into a glass membrane
 * with the place's vitals and a route handoff to Google Maps.
 */

import { AnimatePresence, motion } from "framer-motion";
import type { Place } from "@/lib/places";
import { categoryById } from "@/lib/places";
import { useT } from "@/lib/i18n";

export default function PlaceDetail({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const { t } = useT();
  return (
    <AnimatePresence>
      {place && (
        <motion.aside
          key={place.id}
          initial={{ opacity: 0, y: 48, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 32, scale: 0.97, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="ee-glass fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,26rem)] p-5"
          aria-label={`${place.name}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: `hsl(${categoryById(place.category).hue}, 75%, 70%)` }}>
                {t(`cat.${place.category}`)}
                {place.isGem && <span className="ml-2 text-yellow-200/90">✦ {t("detail.gem")}</span>}
              </p>
              <h3 className="mt-1 text-lg font-medium ee-glow-text">{place.name}</h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ee-text-dim)" }}>
                {place.address}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={t("detail.close")}
              className="rounded-full w-7 h-7 grid place-items-center text-xs"
              style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}
            >
              ✕
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm" style={{ color: "var(--ee-text)" }}>
            <span aria-label={`Rating ${place.rating}`}>★ {place.rating.toFixed(1)}</span>
            <span>{(place.distanceM / 1000).toFixed(1)} km</span>
            <span aria-label={`Price level ${place.priceLevel}`}>{"€".repeat(Math.max(1, place.priceLevel + 1))}</span>
            {place.openNow != null && (
              <span style={{ color: place.openNow ? "hsl(140, 70%, 65%)" : "hsl(0, 70%, 70%)" }}>{place.openNow ? t("detail.open") : t("detail.closed")}</span>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center text-sm py-2.5 rounded-xl font-medium transition-transform active:scale-95"
              style={{ background: "var(--ee-accent)", color: "var(--ee-bg-deep)", boxShadow: "0 0 24px var(--ee-glow)" }}
            >
              {t("detail.route")}
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.source === "google" ? place.id : ""}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 grid place-items-center text-sm rounded-xl"
              style={{ border: "1px solid var(--ee-line)", color: "var(--ee-text-dim)" }}
            >
              {t("detail.maps")}
            </a>
          </div>
          {place.source === "echo" && (
            <p className="mt-3 text-[10px]" style={{ color: "var(--ee-text-dim)" }}>
              {t("detail.demo")}
            </p>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
