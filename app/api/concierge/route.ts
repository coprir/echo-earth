import { NextRequest, NextResponse } from "next/server";
import { ConciergeRequestSchema } from "@/lib/ai/types";
import { buildConciergeContext } from "@/lib/ai/buildContext";
import { requestConciergeCompletion } from "@/lib/ai/anthropic";
import { validateAIResponse } from "@/lib/ai/validate";
import { fingerprint, getCached, setCached } from "@/lib/ai/cache";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { log } from "@/lib/log";

/**
 * AI Concierge completion endpoint (Phase 5 / AIC in IMPLEMENTATION_PLAN.md).
 *
 * This route never invents place data — it only ever asks the model to
 * choose among and narrate a candidate set the *caller* already fetched
 * from the real data layer (Google Places or echo synthesis). Every
 * response is validated twice: once structurally (zod, via
 * `client.messages.parse`) and once semantically (`validateAIResponse` —
 * every returned place id must be a member of the posted candidate set).
 * A `null` "ai" field in the response is an expected, non-error outcome —
 * missing key, timeout, upstream failure, or a response that didn't
 * validate all collapse to the same thing: the client falls back to its
 * already-displayed deterministic journey, exactly as if this route had
 * never been called.
 */

// Stricter than the data routes (places/weather/geo get 60/min) — real LLM
// calls cost real money, and this endpoint has no legitimate high-frequency
// use case (it's invoked once per Concierge "generate"/"regenerate" tap).
const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const limit = checkRateLimit(`concierge:${key}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    log.warn({ route: "/api/concierge", branch: "rate_limited" });
    return NextResponse.json(
      { ai: null },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = ConciergeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const context = buildConciergeContext(parsed.data);
  const fp = fingerprint(context);

  const cached = getCached(fp);
  if (cached) {
    const validated = validateAIResponse(cached, context);
    if (validated) {
      log.info({ route: "/api/concierge", branch: "cache_hit" });
      return NextResponse.json({ ai: validated });
    }
  }

  const raw = await requestConciergeCompletion(context);
  const validated = validateAIResponse(raw, context);

  if (!validated) {
    log.info({ route: "/api/concierge", branch: raw ? "invalid_response" : "no_result" });
    return NextResponse.json({ ai: null });
  }

  setCached(fp, validated);
  log.info({ route: "/api/concierge", branch: "live" });
  return NextResponse.json({ ai: validated });
}
