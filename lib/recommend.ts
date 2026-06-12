/**
 * Recommendation cortex — turns context (mood mode, time, weather, travel
 * mode, learned affinities) into a ranked category order and a place filter.
 * This is the deterministic core; an LLM layer can wrap it later via the
 * ai_suggestions table (see supabase/schema.sql).
 */

import { CATEGORIES, Category, CategoryId, Place } from "./places";
import type { MoodMode, TravelMode } from "@/engine/useAdaptiveMind";
import type { TimePhase, WeatherKind } from "@/engine/environment";

const MODE_CATEGORIES: Record<MoodMode, CategoryId[]> = {
  explore: [],
  latenight: ["clubs", "cocktails", "fastfood", "taverns", "petrol", "pharmacies"],
  rainyday: ["cafes", "restaurants", "coworking", "gems"],
  cheapeats: ["fastfood", "cafes", "restaurants", "taverns"],
  luxury: ["cocktails", "restaurants", "hotels", "scenic"],
  hiddengems: ["gems", "taverns", "cafes", "scenic", "beaches"],
};

export const MODE_META: Record<MoodMode, { label: string; whisper: string }> = {
  explore: { label: "Explore", whisper: "the city is open" },
  latenight: { label: "Late Night", whisper: "for the hours that don't sleep" },
  rainyday: { label: "Rainy Day", whisper: "warm light, steamed windows" },
  cheapeats: { label: "Cheap Eats", whisper: "full plates, light wallets" },
  luxury: { label: "Luxury", whisper: "the city's upper atmosphere" },
  hiddengems: { label: "Hidden Gems", whisper: "places the maps whisper about" },
};

/** Rank categories for the orb ring: mode first, then travel context, then learned taste. */
export function rankCategories(mode: MoodMode, travel: TravelMode, phase: TimePhase, weather: WeatherKind, favorites: CategoryId[]): Category[] {
  const score = new Map<CategoryId, number>(CATEGORIES.map((c) => [c.id, 0]));
  const add = (id: CategoryId, n: number) => score.set(id, (score.get(id) ?? 0) + n);

  MODE_CATEGORIES[mode].forEach((id, i) => add(id, 100 - i * 8));

  if (travel === "driving") ["petrol", "fastfood", "hotels"].forEach((id, i) => add(id as CategoryId, 60 - i * 10));
  if (travel === "walking") ["cafes", "taverns", "gems", "scenic"].forEach((id, i) => add(id as CategoryId, 40 - i * 6));

  if (phase === "latenight" || phase === "night") ["clubs", "cocktails", "fastfood"].forEach((id, i) => add(id as CategoryId, 30 - i * 5));
  if (phase === "dawn" || phase === "day") ["cafes", "gyms", "coworking", "beaches"].forEach((id, i) => add(id as CategoryId, 25 - i * 4));

  if (weather === "rain" || weather === "drizzle" || weather === "thunder") ["cafes", "restaurants", "coworking"].forEach((id, i) => add(id as CategoryId, 35 - i * 5));
  if (weather === "clear") ["beaches", "scenic"].forEach((id, i) => add(id as CategoryId, 20 - i * 5));

  favorites.forEach((id, i) => add(id, 50 - i * 9)); // learned taste

  return [...CATEGORIES].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
}

/** Filter + re-rank places inside a category for the active mode. */
export function filterPlaces(places: Place[], mode: MoodMode): Place[] {
  let out = places;
  if (mode === "latenight") out = places.filter((p) => p.openNow !== false);
  if (mode === "cheapeats") out = places.filter((p) => p.priceLevel <= 1);
  if (mode === "luxury") out = places.filter((p) => p.priceLevel >= 3 || p.rating >= 4.6);
  if (mode === "hiddengems") out = places.filter((p) => p.isGem);
  if (out.length === 0) out = places; // never leave the visitor with a dead city
  if (mode === "luxury") return [...out].sort((a, b) => b.rating - a.rating);
  return out;
}

/** A one-line thought the organism shares about the current context. */
export function whisper(mode: MoodMode, phase: TimePhase, weather: WeatherKind, city: string | null, travel: TravelMode): string {
  if (travel === "driving") return "you're moving fast — fuel and quick food are lit up";
  if (mode !== "explore") return MODE_META[mode].whisper;
  if (weather === "rain" || weather === "drizzle") return `rain over ${city ?? "the city"} — I surfaced warm rooms`;
  if (weather === "snow") return "snowfall — everything slow and close is glowing";
  if (phase === "latenight") return "the late hours — only the open doors are pulsing";
  if (phase === "dawn") return "the city is waking with you";
  if (phase === "dusk") return "golden hour — the scenic nodes are brightest now";
  return `I'm listening to ${city ?? "your city"} — touch a node`;
}
