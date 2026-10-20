import "server-only";
import type { ConciergeAIResponse, ConciergeContext } from "./types";

/**
 * In-memory, per-process cache for AI concierge responses, keyed by a
 * context fingerprint — same cost-control intent as the `ai_suggestions`
 * Supabase table described in the original schema/ARCHITECTURE.md, but
 * without a database dependency (Supabase isn't wired into the data path
 * yet — see SUP-6/AIC-4 in IMPLEMENTATION_PLAN.md). Same caveat as
 * lib/rateLimit.ts: per-process only, not shared across serverless
 * instances. Swapping this for the `ai_suggestions` table later is a
 * drop-in replacement — callers only see `get`/`set`.
 *
 * The fingerprint deliberately excludes `favorites` (personal/learned
 * taste) and the exact candidate list, so the cache is safely shareable
 * across different visitors in the same city/mood/weather context, not
 * just within one visitor's session.
 */

interface Entry {
  value: ConciergeAIResponse;
  expiresAt: number;
}

const TTL_MS = 20 * 60_000;
const cache = new Map<string, Entry>();

export function fingerprint(ctx: Pick<ConciergeContext, "energy" | "language" | "local" | "city" | "weather" | "phase" | "season" | "mode" | "travel">): string {
  return [ctx.energy, ctx.language, ctx.local, ctx.city ?? "", ctx.weather.kind, ctx.phase, ctx.season, ctx.mode, ctx.travel].join("|");
}

export function getCached(key: string): ConciergeAIResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(key: string, value: ConciergeAIResponse): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}
