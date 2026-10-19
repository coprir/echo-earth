"use client";

/**
 * PresenceField — the visible half of realtime explorer presence
 * (docs/realtime-presence.md has the full threat model; engine/usePresence.ts
 * owns the data). Deliberately abstract: a small, drifting cluster of soft
 * glowing motes near the organism's own nucleus, driven only by a *count*
 * of other currently-connected explorers in the same city.
 *
 * Privacy-by-design choice, not just a visual preference: this renders
 * nothing that maps to any individual explorer's real bearing, distance, or
 * cell. Only the aggregate count ever reaches this component (see
 * engine/usePresence.ts) — there is no per-explorer position data to plot in
 * the first place, so there's nothing here that could be reverse-engineered
 * into "where is explorer X," even approximately.
 */

import { useId, useMemo } from "react";
import { useT } from "@/lib/i18n";

const MAX_VISIBLE_MOTES = 6;

export default function PresenceField({
  othersCount,
  connected,
  reducedMotion,
}: {
  othersCount: number;
  /** Only render the visual/announcement when the channel is actually live — never fake it. */
  connected: boolean;
  reducedMotion: boolean;
}) {
  const { t } = useT();
  const labelId = useId();
  const visible = connected && othersCount > 0;
  const moteCount = Math.min(othersCount, MAX_VISIBLE_MOTES);

  // Stable per-mount scatter (not tied to real position data at all) —
  // recomputed only when the number of rendered motes changes, so they
  // don't visibly "jump" on every presence sync tick.
  const motes = useMemo(
    () =>
      Array.from({ length: moteCount }, (_, i) => ({
        key: i,
        // percentage offsets within a small region around the nucleus —
        // intentionally not derived from any geohash/bearing/distance
        top: 42 + Math.sin(i * 2.4) * 10,
        left: 50 + Math.cos(i * 2.4) * 10,
        delay: (i * 0.37) % 2,
      })),
    [moteCount]
  );

  return (
    <>
      {/* screen-reader announcement — independent of the visual, so the
          feature degrades gracefully for anyone not perceiving the canvas */}
      <p id={labelId} role="status" aria-live="polite" className="sr-only">
        {visible ? t("presence.nearby", { n: othersCount }) : ""}
      </p>

      {visible && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {motes.map((m) => (
            <span
              key={m.key}
              className={reducedMotion ? "absolute rounded-full" : "absolute rounded-full ee-breathe"}
              style={{
                top: `${m.top}%`,
                left: `${m.left}%`,
                width: 6,
                height: 6,
                background: "var(--ee-accent2)",
                boxShadow: "0 0 10px var(--ee-glow)",
                opacity: 0.45,
                animationDelay: reducedMotion ? undefined : `${m.delay}s`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
