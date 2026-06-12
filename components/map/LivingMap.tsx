"use client";

/**
 * LivingMap — real Google Map tiles, restyled to match the organism's mood,
 * rendered as a dim living substrate beneath the NeuralMap overlay.
 * Loads only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY exists; otherwise renders
 * nothing and the NeuralMap stands alone (demo mode).
 */

import { useEffect, useRef } from "react";
import type { Theme } from "@/engine/environment";

declare global {
  interface Window {
    google?: typeof google;
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

export default function LivingMap({ lat, lon, theme }: { lat: number; lon: number; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!key || !ref.current) return;
    let cancelled = false;
    import("@googlemaps/js-api-loader").then(async ({ setOptions, importLibrary }) => {
      setOptions({ key, v: "weekly" });
      const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
      if (cancelled || !ref.current) return;
      mapRef.current = new Map(ref.current, {
        center: { lat, lng: lon },
        zoom: 14,
        disableDefaultUI: true,
        gestureHandling: "none",
        keyboardShortcuts: false,
        styles: moodStyles(theme),
        backgroundColor: "transparent",
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    mapRef.current?.setCenter({ lat, lng: lon });
  }, [lat, lon]);

  useEffect(() => {
    mapRef.current?.setOptions({ styles: moodStyles(theme) });
  }, [theme]);

  if (!key) return null;
  return <div ref={ref} className="absolute inset-0 opacity-30 saturate-50 pointer-events-none" aria-hidden />;
}
