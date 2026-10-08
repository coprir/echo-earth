import type { ConciergeCandidate, ConciergeContext, ConciergeRequest } from "./types";

/**
 * Deterministic candidate filtering (the step the architecture diagram in
 * IMPLEMENTATION_PLAN.md's Phase 5 places *before* the AI request). Pure
 * function: given the already-validated request body, produce the trimmed
 * context actually sent to the model — capped, sorted, deduplicated — never
 * more than the model needs.
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

  const candidates = deduped
    .sort((a, b) => b.rating - a.rating || a.distanceM - b.distanceM)
    .slice(0, MAX_CANDIDATES_TO_MODEL);

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
