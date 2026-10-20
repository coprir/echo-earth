import { z } from "zod";
import { CATEGORIES, type CategoryId } from "@/lib/places";
import { ENERGIES, type Energy } from "@/lib/itinerary";
import type { Lang } from "@/lib/i18n";
import type { TimePhase, Season, WeatherKind } from "@/engine/environment";
import type { MoodMode, TravelMode } from "@/engine/useAdaptiveMind";

/**
 * Structured types for the AI Concierge layer (Phase 5 / AIC in
 * IMPLEMENTATION_PLAN.md). Two schemas live here:
 *   - request/candidate shapes the client posts to /api/concierge
 *   - the model's structured response, validated via zod before anything
 *     reaches the UI (client.messages.parse + zodOutputFormat)
 *
 * The AI is never the source of truth for place data — it only ever
 * references a `placeId` from the candidate set it was given; the route
 * and the client both re-validate that every returned id is a member of
 * the real candidate set before it's used for anything (see lib/ai/validate.ts).
 */

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
const ENERGY_IDS = ENERGIES.map((e) => e.id) as [Energy, ...Energy[]];

// Hardcoded rather than derived from lib/i18n.ts's `LANGS` runtime array on
// purpose: lib/i18n.ts carries a top-level "use client" directive, and this
// module is imported by a genuinely server-only route (app/api/concierge) —
// pulling a "use client" module's runtime value into server-only code breaks
// under Next's RSC bundler (confirmed: `next build` threw "LANGS.map is not
// a function" when this was `LANGS.map(...)`, even though tsc/vitest both
// saw no problem, since neither understands the "use client" boundary).
// Keep this list in sync with lib/i18n.ts's `Lang` type.
const LANG_CODES = ["en", "ar", "fr", "zh", "es", "ru", "el", "tr", "de"] as const satisfies readonly Lang[];

// These five are plain TS union types (no runtime array to derive an enum
// from) — keep this list in sync with engine/environment.ts (TimePhase,
// Season, WeatherKind) and engine/useAdaptiveMind.ts (MoodMode, TravelMode).
const TIME_PHASES = ["dawn", "day", "dusk", "night", "latenight"] as const satisfies readonly TimePhase[];
const SEASONS = ["winter", "spring", "summer", "autumn"] as const satisfies readonly Season[];
const WEATHER_KINDS = [
  "clear",
  "clouds",
  "rain",
  "drizzle",
  "thunder",
  "snow",
  "mist",
  "unknown",
] as const satisfies readonly WeatherKind[];
const MOOD_MODES = [
  "explore",
  "latenight",
  "rainyday",
  "cheapeats",
  "luxury",
  "hiddengems",
] as const satisfies readonly MoodMode[];
const TRAVEL_MODES = ["still", "walking", "driving"] as const satisfies readonly TravelMode[];

export const ConciergeCandidateSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORY_IDS),
  rating: z.number().min(0).max(5),
  priceLevel: z.number().int().min(0).max(4),
  openNow: z.boolean().nullable(),
  distanceM: z.number().min(0).max(1_000_000),
  isGem: z.boolean(),
});
export type ConciergeCandidate = z.infer<typeof ConciergeCandidateSchema>;

// Hard cap before any further server-side capping (lib/ai/buildContext.ts) —
// bounds request body size and, transitively, prompt/token cost regardless
// of what a client sends.
const MAX_POSTED_CANDIDATES = 60;

export const ConciergeRequestSchema = z.object({
  energy: z.enum(ENERGY_IDS),
  language: z.enum(LANG_CODES),
  local: z.boolean(),
  city: z.string().max(100).nullable(),
  country: z.string().max(10).nullable(),
  weatherKind: z.enum(WEATHER_KINDS),
  tempC: z.number().min(-100).max(100).nullable(),
  phase: z.enum(TIME_PHASES),
  season: z.enum(SEASONS),
  mode: z.enum(MOOD_MODES),
  travel: z.enum(TRAVEL_MODES),
  // learned category affinities only — never raw interaction timestamps/ids
  favorites: z.array(z.enum(CATEGORY_IDS)).max(10),
  candidates: z.array(ConciergeCandidateSchema).min(1).max(MAX_POSTED_CANDIDATES),
});
export type ConciergeRequest = z.infer<typeof ConciergeRequestSchema>;

/** The fully-assembled context actually sent to the model (lib/ai/buildContext.ts). */
export interface ConciergeContext {
  energy: Energy;
  language: Lang;
  local: boolean;
  city: string | null;
  country: string | null;
  weather: { kind: WeatherKind; tempC: number | null };
  phase: TimePhase;
  season: Season;
  mode: MoodMode;
  travel: TravelMode;
  favorites: CategoryId[];
  candidates: ConciergeCandidate[];
}

export const ConciergeAIResponseSchema = z.object({
  narrative: z.string().min(1).max(600),
  stops: z
    .array(
      z.object({
        placeId: z.string().min(1).max(200),
        reason: z.string().min(1).max(240),
      })
    )
    .min(1)
    .max(8),
});
export type ConciergeAIResponse = z.infer<typeof ConciergeAIResponseSchema>;
