# ECHO EARTH — Baseline Verification

Last verified: 2026-10-06, by Claude Code (baseline check, no feature work).
Environment: Node v22.14.0 / npm 11.19.1 / Windows 11.

This document records the result of a reproducible baseline check: install → lint →
typecheck → build → run → route smoke test → demo-mode verification. No product
features, Supabase, Claude/Anthropic, or realtime presence were implemented as part
of this pass — see `ARCHITECTURE.md` for what those would require.

## npm install

**Result: PASS.** `npm install` completed cleanly — 383 packages added, 0 install
errors, 0 peer-dependency conflicts. `npm ls` confirms every top-level dependency
resolved to the exact version pinned in `package.json` (next@15.5.19, react@19.2.4,
react-dom@19.2.4, typescript@5.9.3, tailwindcss@4.3.0, zustand@5.0.14,
framer-motion@12.40.0, three@0.184.0, @react-three/fiber@9.6.1,
@react-three/drei@10.7.7, @googlemaps/js-api-loader@2.1.1, gsap@3.15.0).

Two packages have install scripts npm didn't run automatically (`sharp`,
`unrs-resolver` — both transitive, pulled in by Next.js/eslint tooling, not direct
dependencies); this didn't block install, build, or runtime.

`git status` after install/build is clean — `node_modules/` and `.next/` stayed
gitignored, `package-lock.json` was already in sync and was not rewritten.

## Dependency status / audit

**Result: PASS (no action taken, by design).** `npm audit` reports 12 vulnerabilities
(1 moderate, 10 high, 1 critical), all in transitive dependencies of build tooling
(`next`, `eslint-config-next` → `braces`/`micromatch`/`fast-glob`, `postcss`, `sharp`,
`js-yaml`, `nanoid`, `brace-expansion`, `fflate` via `three-stdlib`). These are
advisory-chain findings in dev/build tooling, not exploitable app-facing issues, and
`npm audit fix --force` would downgrade `eslint-config-next` to 14.2.35 — a breaking
change outside the scope of "fix only errors necessary for a clean baseline." Flagging
for your awareness; not fixed.

## Lint (`npm run lint`)

**Result: PASS — 0 errors, 5 pre-existing warnings.** No fixes applied (warnings only,
none blocking):

- `components/concierge/Concierge.tsx:25` — `mind` assigned but never used
- `components/hud/HudMenu.tsx:67` — `aria-pressed` not supported on `role="menuitem"`
- `components/organism/Consciousness.tsx:12` — `useMemo` imported but never used
- `engine/environment.ts:175` — `dark` assigned but never used
- `engine/useEnvironment.ts:104` — unused `eslint-disable` directive

## TypeScript

**Result: PASS — 0 errors.** Verified two ways: `next build`'s internal type check
("Linting and checking validity of types ... ✓") and a standalone `npx tsc --noEmit`
(exit 0, no output). No type errors anywhere in `app/`, `engine/`, `lib/`, `components/`.

## Production build (`npm run build`)

**Result: PASS.** Compiled successfully in ~72s, all 9 routes generated with no
errors:

```
Route (app)                                 Size  First Load JS
┌ ○ /                                    91.5 kB         194 kB
├ ○ /_not-found                            994 B         104 kB
├ ƒ /api/geo                               136 B         103 kB
├ ƒ /api/places                            136 B         103 kB
├ ƒ /api/weather                           136 B         103 kB
├ ○ /robots.txt                            136 B         103 kB
└ ○ /sitemap.xml                           136 B         103 kB
```

One informational note (not an error): `Using edge runtime on a page currently
disables static generation for that page` — expected, since `app/api/geo/route.ts`
declares `export const runtime = "edge"`.

## Local runtime (`npm run dev`)

**Result: PASS.** Dev server starts in ~6–9.5s with no startup errors, serving on
`http://localhost:3000`.

## API route verification

Tested against the running dev server with **no env vars set** (demo mode):

| Route | Status | Notes |
|---|---|---|
| `/` | 200 | Full HTML shell + correct `<title>` and metadata |
| `/api/geo` | 200 | `{"lat":-1.2864,"lon":36.8172,"city":"Nairobi","country":"KE","source":"fallback"}` |
| `/api/weather` | 200 | `{"kind":"rain","tempC":31,"description":"rain skies (echo-sensed)","source":"echo"}` |
| `/api/places` | 200 | Synthesized place list (`"source":"echo"`), correct shape (`distanceM`, `bearing`, `isGem`, etc.) |
| `/sitemap.xml` | 200 | Valid XML, one `<url>` entry for the canonical root |
| `/robots.txt` | 200 | `Allow: /`, `Disallow: /api/`, correct sitemap/host lines |

`/api/geo`'s `"source":"fallback"` is expected here: the outbound IP-lookup
(`ipapi.co`) returned HTTP 429 (rate-limited) when probed directly from this sandbox
— an external-service/network condition, not a code defect. The route's fallback
chain (edge headers → ipapi → hardcoded Nairobi default) engaged exactly as
`app/api/geo/route.ts` is written to do.

## Demo/fallback mode

**Result: PASS — confirmed working end-to-end, in-browser.** With zero env vars:

- Language gate renders (9 languages) → English selected → app loads to the main
  field view with no blank screen, no crash.
- HUD correctly reads `Nairobi, KE · rain 31° · late night · spring · 24% · net fast`
  and labels the map **"demo city · no API key"**.
- `NeuralMap` renders synthesized neurons (Aurora Beans, Mara Roastery, Lumen Coffee,
  etc.) matching the `/api/places` payload, with working click interaction (opened
  the "what is this?" About panel without error).
- Mood lenses (Explore/Late Night/Rainy Day/Cheap Eats/Luxury/Hidden Gems) and
  category orbs rendered correctly.
- Browser console: only one message during the entire session, a benign
  `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
  warning from `three.js` internals — zero errors or exceptions.

This confirms the README's claim ("it works with zero API keys") is accurate.

## Google Maps / Places / OpenWeather integration (code-path check, no real keys)

Per your instruction not to supply credentials yet, this was verified with
**dummy placeholder keys** (`GOOGLE_MAPS_API_KEY=dummy-test-key`,
`OPENWEATHER_API_KEY=dummy-test-key`) to confirm the integration *code paths*
engage correctly and degrade gracefully on failure, rather than to validate real
API responses:

- With the dummy key set, `/api/weather` attempted the real OpenWeather call,
  received a non-OK response (invalid key), and its `try/catch` + `if (res.ok)`
  guard fell through to the same synthesized-weather response — no 500, no crash.
- With the dummy key set, `/api/places` attempted `googleNearby()`, the Places API
  rejected the invalid key, the `catch` block fell through to `synthesizePlaces()`
  — same result, no crash.
- `components/map/LivingMap.tsx` only attempts to load `@googlemaps/js-api-loader`
  when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set (code-reviewed, not exercised with a
  real key here); without it, it returns `null` and the `NeuralMap` canvas stands
  alone — this is exactly what was observed in the no-key run above.

**Conclusion: the three optional integrations are wired correctly and fail safe.**
Validating that they return *correct live data* still requires real credentials from
you, which you said you'd provide later — that step remains open.

## Browser / runtime errors

**Result: PASS — none observed.** Across language-gate load, main-field load, and a
UI interaction (opening the About panel), the only console message logged across the
whole session was the non-fatal `three.js` `Clock` deprecation notice mentioned above.
No React hydration warnings, no thrown exceptions, no failed network requests surfaced
in-page.

## Remaining technical problems

1. **`npm audit`: 12 advisories (1 critical, 10 high, 1 moderate)** in transitive
   build-tool dependencies (next/eslint-config-next chain, postcss, sharp, js-yaml,
   nanoid, brace-expansion). Not fixed in this pass (see "Dependency status" above) —
   worth a deliberate upgrade pass later, outside baseline scope.
2. **5 ESLint warnings** (unused vars/import, one a11y nit) — listed above, harmless,
   not fixed since they're warnings, not errors.
3. **Supabase, Claude/Anthropic, and realtime presence remain unimplemented** —
   by your explicit instruction, untouched in this pass. See `ARCHITECTURE.md` §5/§7
   and the earlier reconnaissance notes for what's missing.
4. **Google Maps / Places / OpenWeather still need real credentials** from you to
   verify live-data correctness (fail-safe behavior is confirmed; live-data
   correctness is not, since no real key was supplied).
5. **`/api/geo`'s `ipapi.co` fallback is currently rate-limited (429)** from this
   environment's egress IP — not a code bug, but means the "IP → city" guess will
   silently use the Nairobi hardcoded fallback until that clears or the app is
   deployed behind Vercel/Cloudflare edge headers (which take priority and don't hit
   `ipapi.co` at all).

---

## BASELINE STATUS: **PASS**

Install, lint, typecheck, build, dev-server runtime, all 6 required routes, and
documented demo/fallback mode all work with zero environment variables, exactly as
designed. No errors required fixing to reach this state — the repository was already
a clean, reproducible baseline. The only open items are the audit advisories (tooling,
non-blocking) and the pieces you explicitly deferred (Supabase, Claude, realtime,
and live third-party credential verification).

---

## Update — Phases 1–5 (2026-10-08)

Everything below reflects the state after implementing IMPLEMENTATION_PLAN.md's
Phase 1 (Foundation), Phase 2 (Core Polish), Phase 3 (Real Data Hardening), Phase 4
(Supabase identity/RLS), and Phase 5 (AI Concierge). Each phase was committed
separately with lint/typecheck/test/build verified green before moving to the next —
see `git log` for the individual commits and their detailed messages.

### What changed since the baseline above

- **Testing**: Vitest (two projects — see `vitest.config.ts`'s comments for why) +
  Playwright scaffolding now exists. **0 → 20 test files, 0 → 66 tests, all passing.**
- **Lint**: the 5 pre-existing warnings listed above are now **0** — each was a real,
  fixed issue (an a11y bug, 4 genuinely-unused values), not suppressed.
- **Dead code removed** (verified unused via repo-wide import grep before deletion):
  `components/organism/Awakening.tsx`, `engine/consciousness.ts`.
- **Env validation, logging, error boundaries**: `lib/env.server.ts`/`lib/env.client.ts`
  (zod-validated, `server-only`-enforced), `lib/log.ts`, React error boundaries around
  WebGL/map/concierge widgets.
- **API hardening**: shared fetch-timeout + rate-limiting utilities now cover
  `/api/geo`, `/api/weather`, `/api/places`, and the new `/api/concierge`.
- **Supabase**: client factories exist; an anonymous-identity bootstrap
  (`engine/useSupabaseSession.ts`) and an RLS-fix migration exist and are code
  -complete, but **unverified against a live database** — see "What's still not
  verified" below.
- **AI Concierge** (Phase 5 — new this update): see the dedicated section below.
- **Build**: `/` First Load JS is now 117 kB / 219 kB (was 91.5 kB / 194 kB) — the
  growth is real and accounted for: zod-validated env (~24 kB) landed in Phase 1; the
  Supabase and Anthropic SDKs are both confirmed to add **zero** client-bundle weight
  (service-role/Anthropic code is server-only-guarded; the anon Supabase client is
  dynamically imported and gated on config presence — both were verified by diffing
  the build output before/after, and one real regression of this exact kind was
  caught and fixed in Phase 4 before it was ever committed).

### AI Concierge: architecture vs. service — read this distinction carefully

**AI ARCHITECTURE IMPLEMENTED: yes.** All of the following exist, are wired together,
and are covered by tests that mock the Anthropic SDK at the boundary (no real API key
used or needed to verify any of it):

- A deterministic candidate-filtering step (`lib/ai/buildContext.ts`) that caps,
  dedupes, and sorts whatever candidate places the caller already fetched from the
  real data layer, before anything is sent to a model.
- A structured request/response contract validated with zod end-to-end
  (`lib/ai/types.ts`), using the Anthropic SDK's `messages.parse()` +
  `zodOutputFormat()` — not free-form text parsing.
- A semantic anti-hallucination gate (`lib/ai/validate.ts`): every place id the model
  returns is checked against the real candidate set it was given; anything else is
  dropped; if nothing survives, the result is treated exactly like "no AI response."
- A dedicated, rate-limited, input-validated API route (`app/api/concierge/route.ts`)
  with an in-memory response cache (`lib/ai/cache.ts`) keyed by non-personal context
  only.
- A deterministic-first UI integration (`components/concierge/Concierge.tsx`): the
  existing deterministic journey (`lib/itinerary.ts`, unchanged) always renders
  immediately; the AI layer is called afterward as a best-effort, time-boxed upgrade
  that silently no-ops on any failure, timeout, or missing key. A small "✦ AI-refined"
  label (translated into all 9 languages) appears **only** when a response actually
  came from the model — the deterministic fallback is never mislabeled as AI-generated.

**AI SERVICE LIVE: no.** `ANTHROPIC_API_KEY` has never been set in this environment,
and the code path that actually calls `POST /v1/messages` has **never executed against
the real Anthropic API** in this sandbox — only against a mocked
`requestConciergeCompletion` in tests. Every behavioral claim above (candidate
filtering, schema validation, anti-hallucination, caching, fallback) is verified at
the mock boundary; none of it has been verified against real model output. That
verification is the next required step once a real key is available (see "Required
human actions" below) — until then, the app's live behavior is byte-identical to
before Phase 5: the deterministic concierge, unchanged.

### What's still not verified (REQUIRES HUMAN ACTION)

1. **Supabase**: Anonymous Sign-ins must be enabled in the project dashboard, a real
   project linked, and the migrations applied — see `docs/environment.md`. No Docker
   daemon is running in this sandbox either, so even local RLS verification isn't
   possible here.
2. **Real API keys** (`GOOGLE_MAPS_API_KEY`, `OPENWEATHER_API_KEY`,
   `ANTHROPIC_API_KEY`) — all three integrations are confirmed to fail safe without
   them (demo/deterministic fallback engages correctly), but none has been verified
   against the real service's actual output.
3. **Device-tier particle scaling** (`PRF-1` in IMPLEMENTATION_PLAN.md) — flagged as a
   product decision requiring your sign-off, not changed.

---

## Update — Phase 6: Recommendation Engine (2026-10-08)

Traced the actual pipeline (`USER SIGNALS → ENVIRONMENT → PLACE DATA →
FILTERING → RANKING → RECOMMENDATION → AI CONTEXT`) by re-reading every file
in it fresh, per instruction not to assume the prior implementation was
correct. Found three independent, duplicated "best place" heuristics (the
category ranker, the Concierge's inline sort, and the AI context builder's
inline sort) and one real gap (the main field's visible places were never
ranked by rating/distance/taste at all — only hard-filtered). Unified all of
it behind `lib/recommend.ts`'s `buildValidCandidates` (filter → rank), now
shared by `app/page.tsx`, `lib/itinerary.ts`'s `composeJourney`, and
`lib/ai/buildContext.ts`. Full before/after trace and scoring table in
`docs/recommendation-engine.md`.

**Test coverage added**: `lib/recommend.ts` and `lib/itinerary.ts` had **zero**
tests before this phase; both now have comprehensive suites (18 and 10 tests).
Full suite: **22 files / 94 tests, all passing.** Verified: lint (0
errors/warnings), `tsc --noEmit` (clean), build (clean, `/` First Load JS
117kB/220kB — unchanged within 1kB of the Phase 5 baseline).

No REQUIRES HUMAN ACTION items from this phase — it's pure deterministic
logic, no external credentials involved. Supabase-synced memory (`SUP-3`)
remains a separate, still-pending item (see the Phase 4 update above).
