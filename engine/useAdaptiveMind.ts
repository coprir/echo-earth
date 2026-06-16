"use client";

/**
 * useAdaptiveMind — the organism's memory and learning.
 *
 * A zustand store persisted to localStorage that tracks which categories the
 * visitor gravitates toward, how fast they move, and which mood modes they
 * pick. Affinities decay over time so the organism stays curious.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CategoryId } from "@/lib/places";
import type { Atmosphere } from "./environment";
import type { Energy } from "@/lib/itinerary";

export type MoodMode = "explore" | "latenight" | "rainyday" | "cheapeats" | "luxury" | "hiddengems";

export type TravelMode = "still" | "walking" | "driving";

interface MindState {
  affinities: Partial<Record<CategoryId, number>>; // 0..1 learned preference
  visits: number;
  discoveries: number; // total places opened across all visits — dopamine progression
  mode: MoodMode;
  travel: TravelMode;
  atmosphere: Atmosphere; // chosen synthetic weather, persisted
  energy: Energy | null; // last concierge energy, persisted — the mind remembers your vibe
  lastSpeedMps: number;
  nightQuietBias: number; // 0..1 learned preference for quiet places after dark
  noticeCategory: (c: CategoryId, weight?: number) => void;
  recordDiscovery: () => void;
  setMode: (m: MoodMode) => void;
  setAtmosphere: (a: Atmosphere) => void;
  setEnergy: (e: Energy) => void;
  reportSpeed: (metersPerSecond: number) => void;
  wake: () => void;
  /** Categories ranked by learned affinity, strongest first. */
  favorites: () => CategoryId[];
}

export const useAdaptiveMind = create<MindState>()(
  persist(
    (set, get) => ({
      affinities: {},
      visits: 0,
      discoveries: 0,
      mode: "explore",
      travel: "still",
      atmosphere: "auto",
      energy: null,
      lastSpeedMps: 0,
      nightQuietBias: 0,

      noticeCategory: (c, weight = 0.12) =>
        set((s) => {
          const next: MindState["affinities"] = {};
          // all affinities decay slightly; the noticed one grows
          for (const [k, v] of Object.entries(s.affinities)) next[k as CategoryId] = (v ?? 0) * 0.97;
          next[c] = Math.min(1, (next[c] ?? 0) + weight);
          // learn the night-quiet tendency: opening calm categories after dark
          const hour = new Date().getHours();
          const quietCat = c === "cafes" || c === "scenic" || c === "coworking" || c === "gems";
          const nightQuietBias =
            hour >= 20 || hour < 5
              ? Math.min(1, s.nightQuietBias + (quietCat ? 0.08 : -0.05))
              : s.nightQuietBias;
          return { affinities: next, nightQuietBias: Math.max(0, nightQuietBias) };
        }),

      recordDiscovery: () => set((s) => ({ discoveries: s.discoveries + 1 })),

      setMode: (m) => set({ mode: m }),

      setAtmosphere: (a) => set({ atmosphere: a }),

      setEnergy: (e) => set({ energy: e }),

      reportSpeed: (mps) => {
        const travel: TravelMode = mps > 6 ? "driving" : mps > 0.7 ? "walking" : "still";
        set({ lastSpeedMps: mps, travel });
      },

      wake: () => set((s) => ({ visits: s.visits + 1 })),

      favorites: () =>
        (Object.entries(get().affinities) as [CategoryId, number][])
          .filter(([, v]) => v > 0.15)
          .sort((a, b) => b[1] - a[1])
          .map(([k]) => k),
    }),
    { name: "ee-mind" }
  )
);

/** Watch GPS speed to infer walking vs driving, feeding the recommendation engine. */
export function watchTravelMode(): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      if (pos.coords.speed != null) useAdaptiveMind.getState().reportSpeed(pos.coords.speed);
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 30000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
