import "server-only";

/**
 * In-memory, fixed-window rate limiter — per-process, not distributed.
 *
 * This is the correct, sufficient implementation for `next dev`/`next start`
 * on a single long-lived process, and for a single-instance deployment. It is
 * NOT sufficient on a multi-instance serverless platform (e.g. Vercel's
 * default deployment model): each function instance gets its own in-memory
 * Map, so a determined caller can get up to (limit × instance count)
 * requests through rather than `limit`. Production upgrade path: swap this
 * module's internals for `@upstash/ratelimit` + Upstash Redis (needs
 * `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, not yet provisioned —
 * see IMPLEMENTATION_PLAN.md's DAT-1) while keeping the same `checkRateLimit`
 * call signature, so call sites don't need to change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so this Map can't grow unbounded over a
// long-lived process's lifetime.
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();
function cleanupIfDue(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window check: `limit` requests per `windowMs` per `key` (caller
 * supplies the key — typically `${route}:${ip}`).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanupIfDue(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Best-effort client identifier from standard proxy headers, for rate-limit keying only (never logged — see lib/log.ts). */
export function clientKey(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
