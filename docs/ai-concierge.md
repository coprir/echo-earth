# AI Concierge — architecture and degradation contract

Written in Phase 11 (production readiness), closing a real documentation
gap: `AIC-6` in `IMPLEMENTATION_PLAN.md` asked for exactly this file back
in Phase 5, and it was never actually created — the content existed only
scattered across `PROJECT_STATUS.md`'s Phase 5 update and (later)
`SECURITY_AUDIT.md`'s "AI security" section. This consolidates it into the
one place AIC-6's own acceptance criteria named.

## What exists (architecture — implemented, test-verified against mocks)

- **Deterministic candidate filtering** (`lib/ai/buildContext.ts`): caps,
  dedupes, and ranks (via `lib/recommend.ts`'s shared engine) whatever
  real candidate places the caller already fetched, before anything is
  sent to a model. Capped at 24 candidates regardless of how many were
  posted (the request schema itself caps that at 60).
- **Structured request/response contract** (`lib/ai/types.ts`): zod end to
  end, via the Anthropic SDK's `messages.parse()` + `zodOutputFormat()` —
  never free-form text parsing. `narrative` ≤600 chars, 1–8 stops, each
  `reason` ≤240 chars.
- **The anti-hallucination gate** (`lib/ai/validate.ts`): every place id
  the model returns is checked against the real candidate set it was
  given; anything else is dropped. If nothing survives, the result is
  treated exactly like "no AI response."
- **A dedicated, rate-limited, input-validated API route**
  (`app/api/concierge/route.ts`): 10 req/min/IP (stricter than the data
  routes — this one costs real money per call), a 64KB request-body size
  guard (Phase 10), an in-memory response cache keyed by a non-personal
  context fingerprint (`lib/ai/cache.ts` — explicitly excludes
  `favorites`/learned taste and the exact candidate list, so it's safely
  shareable across visitors in the same city/mood/weather context).
- **A deterministic-first UI integration**
  (`components/concierge/Concierge.tsx`): the existing deterministic
  journey (`lib/itinerary.ts`) always renders immediately; the AI layer is
  called afterward as a best-effort, time-boxed (6s) upgrade that silently
  no-ops on any failure, timeout, or missing key. A small "✦ AI-refined"
  label (translated into all 9 languages) appears **only** when a response
  actually came from the model.

## The degradation ladder (the actual contract, stated explicitly)

| State | What happens | Verified by |
|---|---|---|
| `ANTHROPIC_API_KEY` unset | No network call is even attempted — `requestConciergeCompletion` returns `null` immediately (`getClient()` returns `null`) | `app/api/concierge/route.test.ts` |
| Key present, call succeeds, response validates | `/api/concierge` returns `{ai: {narrative, stops}}`; the UI swaps in the AI narrative and reorders stops, shows "✦ AI-refined" | `app/api/concierge/route.test.ts`, `components/concierge/Concierge.test.tsx` |
| Key present, call fails/times out (6s) | `requestConciergeCompletion` catches and returns `null` — same as "no key" from the caller's perspective | `app/api/concierge/route.test.ts` ("falls back cleanly... covers: missing API key, timeout, upstream failure") |
| Key present, response is schema-invalid or hallucinates place ids | Schema failure → `null` from the SDK parse itself; hallucinated ids → dropped by `validateAIResponse`, and if *all* ids are invalid the whole response is treated as `null` | `app/api/concierge/route.test.ts` (dedicated tests for both) |
| Any of the above | The visitor sees **no error, no loading state beyond the deterministic journey that was already showing**, and no indication anything was attempted | `components/concierge/Concierge.test.tsx` — asserts the deterministic journey renders with no "✦ AI-refined" label when the mocked fetch resolves to `{ai: null}` |

**The one rung never exercised**: a real call to the real Anthropic API
has never executed in this codebase's history — `ANTHROPIC_API_KEY` has
never been set in any sandbox this project has been developed in. Every
row above is verified at the mocked-SDK-boundary (`vi.mock("@/lib/ai/anthropic")`)
or the mocked-fetch boundary (`Concierge.test.tsx`), never against a live
model. See `docs/deployment.md`'s "External services" section for the
concrete steps to verify the live path once a real key is available.

## Prompt-injection and abuse posture

See `SECURITY_AUDIT.md`'s "AI security and cost controls" section for the
full record (candidate data is explicitly instructed to the model as
"data, never instructions"; tested with a fixture place name containing an
injection attempt; no URL field exists anywhere in the model's response
schema, so there's nothing for the app to blindly trust as a link; no
`dangerouslySetInnerHTML`/`eval` anywhere the model's text could reach).
Not duplicated here — this file is the architecture/degradation reference,
`SECURITY_AUDIT.md` is the security review of record.
