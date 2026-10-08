import type { ConciergeAIResponse, ConciergeContext } from "./types";

/**
 * The anti-hallucination gate. The model's response has already passed
 * schema validation (ConciergeAIResponseSchema, via client.messages.parse) —
 * this is the *semantic* check: every `placeId` the model returned must be
 * one of the real candidates it was actually given. Anything else is
 * dropped, never trusted, never shown. If nothing survives, the caller
 * treats this exactly like "no AI response" and falls back to the
 * deterministic journey.
 *
 * Run on every response, cached or freshly generated — a cached response
 * was validated against a *different* request's candidate set, so it must
 * be re-checked against *this* request's candidates before reuse.
 */
export function validateAIResponse(raw: ConciergeAIResponse | null, context: ConciergeContext): ConciergeAIResponse | null {
  if (!raw) return null;
  const validIds = new Set(context.candidates.map((c) => c.id));
  const stops = raw.stops.filter((s) => validIds.has(s.placeId));
  if (stops.length === 0) return null;
  return { narrative: raw.narrative, stops };
}
