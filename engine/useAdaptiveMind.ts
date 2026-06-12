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

export type MoodMode = "explore" | "latenight" | "rainyday" | "cheapeats" | "luxury" | "hiddengems";

export type TravelMode = "still" | "walking" | "driving";

interface MindState {
  affinities: Partial<Record<CategoryId, number>>; // 0..1 learned preference
  visits: number;
  mode: MoodMode;
  travel: TravelMode;
  lastSpeedMps: number;
  noticeCategory: (c: CategoryId, weight?: number) => void;
  setMode: (m: MoodMode) => void;
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
      mode: "explore",
      travel: "still",
      lastSpeedMps: 0,

      noticeCategory: (c, weight = 0.12) =>
        set((s) => {
          const next: MindState["affinities"] = {};
          // all affinities decay slightly; the noticed one grows
          for (const [k, v] of Object.entries(s.affinities)) next[k as CategoryId] = (v ?? 0) * 0.97;
          next[c] = Math.min(1, (next[c] ?? 0) + weight);
          return { affinities: next };
        }),

      setMode: (m) => set({ mode: m }),

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
