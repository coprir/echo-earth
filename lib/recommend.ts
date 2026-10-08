/**
 * Recommendation cortex — the single shared ranking engine behind every
 * "which places matter right now" decision in the app: the main field's
 * visible places, the Concierge's journey stops, and the AI context
 * builder's candidate ordering all call the functions here. Before this file
 * existed in its current form, those three call sites each hand-rolled their
 * own slightly-different "best place" heuristic (`rating desc, distance asc`
 * duplicated verbatim in two places, and the main field doing no place-level
 * ranking at all) — see docs/recommendation-engine.md for the before/after.
 *
 * Pipeline shape (docs/recommendation-engine.md has the full diagram):
 *   place data → filterPlaces (hard/mode constraints) → rankPlaces (scoring)
 *   → buildValidCandidates (both, composed) → deterministic UI and/or the AI
 *   context builder.
 */

import { CATEGORIES, Category, CategoryId } from "./places";
import type { MoodMode, TravelMode } from "@/engine/useAdaptiveMind";
import type { TimePhase, WeatherKind } from "@/engine/environment";

export const MODE_META: Record<MoodMode, { label: string; whisper: string }> = {
  explore: { label: "Explore", whisper: "the city is open" },
  latenight: { label: "Late Night", whisper: "for the hours that don't sleep" },
  rainyday: { label: "Rainy Day", whisper: "warm light, steamed windows" },
  cheapeats: { label: "Cheap Eats", whisper: "full plates, light wallets" },
  luxury: { label: "Luxury", whisper: "the city's upper atmosphere" },
  hiddengems: { label: "Hidden Gems", whisper: "places the maps whisper about" },
};

const MODE_CATEGORIES: Record<MoodMode, CategoryId[]> = {
  explore: [],
  latenight: ["clubs", "cocktails", "fastfood", "taverns", "petrol", "pharmacies"],
  rainyday: ["cafes", "restaurants", "coworking", "gems"],
  cheapeats: ["fastfood", "cafes", "restaurants", "taverns"],
  luxury: ["cocktails", "restaurants", "hotels", "scenic"],
  hiddengems: ["gems", "taverns", "cafes", "scenic", "beaches"],
};

export interface PlaceRankingContext {
  mode: MoodMode;
  travel: TravelMode;
  phase: TimePhase;
  weather: WeatherKind;
  /** learned category affinities, strongest first — see useAdaptiveMind.favorites() */
  favorites: CategoryId[];
}

/* ------------------------------------------------------------------ */
/* Shared category-context scoring — the one set of weights both       */
/* category ranking (the orb strand) and place ranking (within a       */
/* category) score against, so the two can never disagree about        */
/* "how much does the current context want this category."             */
/* ------------------------------------------------------------------ */

interface ScoreRule {
  ids: CategoryId[];
  base: number;
  step: number;
}

function modeRule(mode: MoodMode): ScoreRule {
  return { ids: MODE_CATEGORIES[mode], base: 100, step: 8 };
}
function travelRule(travel: TravelMode): ScoreRule | null {
  if (travel === "driving") return { ids: ["petrol", "fastfood", "hotels"], base: 60, step: 10 };
  if (travel === "walking") return { ids: ["cafes", "taverns", "gems", "scenic"], base: 40, step: 6 };
  return null;
}
function phaseRule(phase: TimePhase): ScoreRule | null {
  if (phase === "latenight" || phase === "night") return { ids: ["clubs", "cocktails", "fastfood"], base: 30, step: 5 };
  if (phase === "dawn" || phase === "day") return { ids: ["cafes", "gyms", "coworking", "beaches"], base: 25, step: 4 };
  return null;
}
function weatherRule(weather: WeatherKind): ScoreRule | null {
  if (weather === "rain" || weather === "drizzle" || weather === "thunder") return { ids: ["cafes", "restaurants", "coworking"], base: 35, step: 5 };
  if (weather === "clear") return { ids: ["beaches", "scenic"], base: 20, step: 5 };
  return null;
}
function favoritesRule(favorites: CategoryId[]): ScoreRule {
  return { ids: favorites, base: 50, step: 9 };
}

function applyRule(score: Map<CategoryId, number>, rule: ScoreRule | null) {
  if (!rule) return;
  rule.ids.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + (rule.base - i * rule.step)));
}

/** How much the current context (mode/travel/phase/weather/favorites) wants each category. */
export function categoryContextScores(ctx: Pick<PlaceRankingContext, "mode" | "travel" | "phase" | "weather" | "favorites">): Map<CategoryId, number> {
  const score = new Map<CategoryId, number>(CATEGORIES.map((c) => [c.id, 0]));
  applyRule(score, modeRule(ctx.mode));
  applyRule(score, travelRule(ctx.travel));
  applyRule(score, phaseRule(ctx.phase));
  applyRule(score, weatherRule(ctx.weather));
  applyRule(score, favoritesRule(ctx.favorites));
  return score;
}

/** Rank categories for the orb ring: mode first, then travel context, then learned taste. */
export function rankCategories(mode: MoodMode, travel: TravelMode, phase: TimePhase, weather: WeatherKind, favorites: CategoryId[]): Category[] {
  const score = categoryContextScores({ mode, travel, phase, weather, favorites });
  return [...CATEGORIES].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
}

/* ------------------------------------------------------------------ */
/* Place-level ranking — generic over anything with these fields, so    */
/* both the full `Place` type and the AI layer's trimmed               */
/* `ConciergeCandidate` type can share one scoring function.            */
/* ------------------------------------------------------------------ */

export interface ScorablePlace {
  category: CategoryId;
  rating: number;
  priceLevel: number;
  openNow: boolean | null;
  distanceM: number;
  isGem: boolean;
}

function scoreWithCategoryMap(place: ScorablePlace, ctx: PlaceRankingContext, categoryScores: Map<CategoryId, number>): number {
  const categoryScore = categoryScores.get(place.category) ?? 0;
  const ratingScore = place.rating * 10; // 0..50
  const distancePenalty = place.distanceM / 150; // further is worse, ~1pt per 150m
  const gemBonus = place.isGem ? (ctx.mode === "hiddengems" ? 40 : 15) : 0;
  const openBonus = place.openNow === true ? 10 : place.openNow === false ? -20 : 0;
  const priceFit = ctx.mode === "luxury" ? place.priceLevel * 6 : ctx.mode === "cheapeats" ? (4 - place.priceLevel) * 6 : 0;
  return categoryScore + ratingScore - distancePenalty + gemBonus + openBonus + priceFit;
}

/** The individual-place score behind `rankPlaces` — exported for tests/inspection. */
export function scorePlace(place: ScorablePlace, ctx: PlaceRankingContext): number {
  return scoreWithCategoryMap(place, ctx, categoryContextScores(ctx));
}

/** Sort places by score (desc), ties broken by distance (asc). Generic so it works for both `Place[]` and `ConciergeCandidate[]`. */
export function rankPlaces<T extends ScorablePlace>(places: T[], ctx: PlaceRankingContext): T[] {
  const categoryScores = categoryContextScores(ctx);
  return places
    .map((p) => ({ p, s: scoreWithCategoryMap(p, ctx, categoryScores) }))
    .sort((a, b) => b.s - a.s || a.p.distanceM - b.p.distanceM)
    .map((x) => x.p);
}

/** Hard/mode constraints — never returns an empty list if the input wasn't empty. */
export function filterPlaces<T extends ScorablePlace>(places: T[], mode: MoodMode): T[] {
  let out = places;
  if (mode === "latenight") out = places.filter((p) => p.openNow !== false);
  if (mode === "cheapeats") out = places.filter((p) => p.priceLevel <= 1);
  if (mode === "luxury") out = places.filter((p) => p.priceLevel >= 3 || p.rating >= 4.6);
  if (mode === "hiddengems") out = places.filter((p) => p.isGem);
  if (out.length === 0) out = places; // never leave the visitor with a dead city
  return out;
}

/**
 * The full pipeline: hard-filter, then rank. This is "PLACE DATA → HARD
 * FILTERING → RANKING ENGINE → VALID CANDIDATES" from
 * docs/recommendation-engine.md as one call — the shared entry point for
 * the main field, the Concierge's journey composer, and the AI context
 * builder.
 */
export function buildValidCandidates<T extends ScorablePlace>(places: T[], ctx: PlaceRankingContext): T[] {
  return rankPlaces(filterPlaces(places, ctx.mode), ctx);
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
