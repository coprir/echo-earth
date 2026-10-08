import { rankPlaces } from "@/lib/recommend";
import type { ConciergeCandidate, ConciergeContext, ConciergeRequest } from "./types";

/**
 * Deterministic candidate filtering (the step the architecture diagram in
 * IMPLEMENTATION_PLAN.md's Phase 5 places *before* the AI request). Pure
 * function: given the already-validated request body, produce the trimmed
 * context actually sent to the model — capped, ranked, deduplicated — never
 * more than the model needs.
 *
 * Ranking goes through lib/recommend.ts's shared `rankPlaces` — the same
 * engine behind the main field's visible places and the Concierge's
 * deterministic journey — so the AI sees candidates in the same priority
 * order the rest of the app would surface them in, not a second,
 * independently-tuned heuristic.
 */

// Cost control: keep the prompt small regardless of how many candidates were
// posted (ConciergeRequestSchema already caps that at 60) — this is the
// number the model actually reasons over.
const MAX_CANDIDATES_TO_MODEL = 24;

export function buildConciergeContext(req: ConciergeRequest): ConciergeContext {
  const seen = new Set<string>();
  const deduped: ConciergeCandidate[] = [];
  for (const c of req.candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    deduped.push(c);
  }

  const candidates = rankPlaces(deduped, {
    mode: req.mode,
    travel: req.travel,
    phase: req.phase,
    weather: req.weatherKind,
    favorites: req.favorites,
  }).slice(0, MAX_CANDIDATES_TO_MODEL);

  return {
    energy: req.energy,
    language: req.language,
    local: req.local,
    city: req.city,
    country: req.country,
    weather: { kind: req.weatherKind, tempC: req.tempC },
    phase: req.phase,
    season: req.season,
    mode: req.mode,
    travel: req.travel,
    favorites: req.favorites,
    candidates,
  };
}
