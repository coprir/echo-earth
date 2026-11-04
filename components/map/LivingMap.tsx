"use client";

/**
 * LivingMap — real Google Map tiles, restyled to match the organism's mood,
 * rendered as a dim living substrate beneath the NeuralMap overlay.
 * Loads only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY exists; otherwise renders
 * nothing and the NeuralMap stands alone (demo mode).
 *
 * A bad key (invalid, unbilled, or referer-restricted — the common state
 * right after setup, and the default for `localhost` until it's allow-listed)
 * doesn't fail cleanly on its own: the JS SDK still "succeeds" and paints its
 * own gray "This page can't load Google Maps correctly" / "For development
 * purposes only" overlay directly into this div — which sits *behind* the
 * neural map as this component's whole job, so that would read as a stray
 * Google error sitting in the organism's background. We hide this layer on
 * ANY failure, detected by success rather than by error: a healthy map fires
 * `tilesloaded`, whereas billing / auth / referer / api-not-enabled errors
 * paint the overlay and load zero tiles. If no tile arrives within a short
 * window we drop the layer. (gm_authFailure and a rejected importLibrary()
 * are also handled, but neither covers BillingNotEnabledMapError — that one
 * fires no callback and, in the current SDK, paints a class-less overlay with
 * nothing stable to match — so the tilesloaded timeout is the real safety net.)
 */

import { useEffect, useRef, useState } from "react";
import type { Theme } from "@/engine/environment";
import { env } from "@/lib/env.client";

declare global {
  interface Window {
    google?: typeof google;
    // Google's documented global auth-failure hook — not shipped in
    // @types/google.maps, so declared here where it's actually used.
    gm_authFailure?: () => void;
  }
}

function moodStyles(theme: Theme): google.maps.MapTypeStyle[] {
  const dark = theme.phase === "night" || theme.phase === "latenight";
  const base = dark ? "#0a0a14" : "#10131f";
  return [
    { elementType: "geometry", stylers: [{ color: base }] },
    { elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2030" }, { lightness: dark ? -10 : 5 }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1626" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
  ];
}

export default function LivingMap({ lat, lon, theme, zoom = 1 }: { lat: number; lon: number; theme: Theme; zoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const key = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // flips true on EITHER failure channel below and permanently unmounts this
  // layer — the neural map above is a complete experience on its own, so a
  // broken Google tile behind it is strictly worse than no tile at all
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || !ref.current) return;
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    let tilesListener: google.maps.MapsEventListener | undefined;

    // Google's auth-failure channel: fires for an invalid key or a
    // referer-restricted origin, but NOT for an unbilled project
    // (BillingNotEnabledMapError never calls it). It's a fast path for the
    // cases it does cover; the tilesloaded timeout below is the real catch-all.
    const prevAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!cancelled) setFailed(true);
    };

    import("@googlemaps/js-api-loader")
      .then(async ({ setOptions, importLibrary }) => {
        setOptions({ key, v: "weekly" });
        const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
        if (cancelled || !ref.current) return;
        const node = ref.current;
        mapRef.current = new Map(node, {
          center: { lat, lng: lon },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          styles: moodStyles(theme),
          backgroundColor: "transparent",
        });

        // Success-based failure detection: a working map fires "tilesloaded".
        // Billing / auth / referer / api-not-enabled errors paint an overlay
        // and never load a tile, so if "tilesloaded" hasn't fired within a
        // short window, hide the whole layer. This is the only channel that
        // reliably catches BillingNotEnabledMapError (no callback, class-less
        // overlay). A healthy map clears the timer before it fires.
        let settled = false;
        tilesListener = mapRef.current.addListener("tilesloaded", () => {
          settled = true;
          if (failTimer) clearTimeout(failTimer);
        });
        failTimer = setTimeout(() => {
          if (!cancelled && !settled) setFailed(true);
        }, 3500);
      })
      .catch((e) => {
        // script/network failure reaching Google at all — same outcome as an
        // auth failure: hide the layer rather than leave a half-built map
        if (!cancelled) {
          console.warn("[LivingMap] Google Maps failed to load; falling back to the neural map alone.", e);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      window.gm_authFailure = prevAuthFailure;
      tilesListener?.remove();
      if (failTimer) clearTimeout(failTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    mapRef.current?.setCenter({ lat, lng: lon });
  }, [lat, lon]);

  // follow the neural field's zoom: factor 1 = tile zoom 14
  useEffect(() => {
    mapRef.current?.setZoom(14 + Math.round(Math.log2(zoom) * 2) / 2);
  }, [zoom]);

  useEffect(() => {
    mapRef.current?.setOptions({ styles: moodStyles(theme) });
  }, [theme]);

  if (!key || failed) return null;
  return <div ref={ref} className="absolute inset-0 opacity-30 saturate-50 pointer-events-none" aria-hidden />;
}
