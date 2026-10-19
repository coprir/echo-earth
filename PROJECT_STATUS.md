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

---

## Update — Phase 7: City Consciousness Audit (2026-10-08)

Re-read `components/organism/Consciousness.tsx` fresh rather than re-trusting
the Phase 2 correction. **Decision: stays deterministic, no LLM** — nothing
found here changes that (it recomposes every ~14s for the whole session;
an LLM call at that cadence would be slower, costlier, and not better than
the already-tuned, fully-translated phrase banks).

Found and fixed three real issues: (1) a genuine stale-closure bug — the
narrator's periodic recomposition could read an outdated `env.now`/
`env.city` for as long as weather/mode/atmosphere/travel happened to stay
constant, plausibly producing a wrong phase-of-day announcement for hours;
fixed with a "latest ref" pattern, zero change to the intended speaking
cadence; (2) dead `category`/`placeCount` props passed from `app/page.tsx`
that the component never read and no translation content ever used —
removed; (3) a missing `aria-hidden` on a decorative element, inconsistent
with the identical pattern already used in `VitalsHUD.tsx` — fixed.

`compose()` (the actual candidate-weighting logic) had zero test coverage
and wasn't independently testable before this audit (defined inline,
closing over component state). Extracted to a pure, exported function;
9 new tests added, including a hand-computed golden case.

**One real engineering hazard hit and fixed, not just avoided in theory:**
combining `vi.useFakeTimers()` with rendering this component (framer-motion's
`AnimatePresence`) hung the vitest worker indefinitely — confirmed by the
process never exiting and requiring a kill. Resolved by using real timers
for the one necessary component-level test, since the detailed logic is
already covered by the timer-free pure-function tests. Documented in
`docs/city-consciousness-audit.md` for the next time fake timers meet a
framer-motion component in this codebase.

Full suite: **23 files / 103 tests, all passing.** Verified: lint (0
errors/warnings), `tsc --noEmit` (clean), build (clean, `/` First Load JS
117kB/220kB — unchanged). No REQUIRES HUMAN ACTION items.

---

## Update — Phase 8: Narrative engine, language/RTL, and lifecycle audit (2026-10-19)

Full record in `docs/narrative-i18n-rtl-audit.md`. Summary:

- **Narrative engine**: `lib/ai/*` (the AI concierge pipeline) re-read fresh
  with no new correctness bugs found. Removed two pieces of genuinely dead,
  hardcoded-English, never-localized narrative code —
  `lib/itinerary.ts`'s `journeyWhisper()` and `lib/recommend.ts`'s
  `whisper()`/`MODE_META` — both leftovers from before Phase 5/6 wired the
  live, translated `con.*` strings in their place. Closed a real test gap:
  `components/concierge/Concierge.tsx` (the deterministic-journey +
  AI-enhancement UI itself) had zero tests despite its dependencies
  (`lib/ai/*`, the route) being well covered; added 3 tests.
- **Language/RTL**: I18-3 (translation coverage) re-verified clean via
  `npm run i18n:check`. I18-2 (RTL) found 5 real physical-CSS leaks
  (`text-left`/`text-right`/`ml-*`/`mr-*` instead of Tailwind's logical
  `text-start`/`text-end`/`ms-*`/`me-*`) across the Concierge, HUD menu,
  AtmospherePicker, PlaceDetail, and the narrator — fixed, and verified with
  a new structural Playwright test (`tests/e2e/rtl.spec.ts`, passing) that
  switches to Arabic and asserts `dir="rtl"` + no horizontal overflow. I18-4
  (SEO `lang` mismatch) was implemented, verified, and **deliberately
  reverted** after measuring that it silently converts `/` from a static,
  CDN-cacheable route to a fully dynamic one on every request (confirmed via
  `next build`'s own `○`/`ƒ` route markers) — flagged as a human decision
  point rather than shipped as a quiet performance regression; the working,
  tested implementation is preserved in this session's `git stash`, not
  deleted.
- **Lifecycle**: fixed two real listener leaks in `engine/useEnvironment.ts`
  (battery `levelchange`, `navigator.connection`'s `change`) that had no
  cleanup at all, unlike every sibling sensor effect in the same file.
  `engine/audio.ts`'s unremoved `visibilitychange` listener was checked and
  confirmed intentional (a deliberate module-level singleton for the tab's
  whole lifetime), not a leak.

Full suite: **24 files / 106 tests, all passing.** Verified: lint (0
errors/warnings), `tsc --noEmit` (clean), build (clean, `/` First Load JS
117kB/220kB — unchanged, confirming the I18-4 revert left no residue), and
the new Playwright RTL spec (passing, Chromium installed this session).
One item requires your decision — see "I18-4" above and
`docs/narrative-i18n-rtl-audit.md`'s closing section.

---

## Checkpoint verification (2026-10-19, post-Phase-8)

Re-ran against a fresh session, before starting any new feature work, per
your request to confirm Phase 8's claims rather than trust the prior report:

- **Git state**: branch `claude-autonomous-development`, HEAD = `82551e2`
  (exactly the commit Phase 8 reported), working tree clean. One stash entry
  present (`stash@{0}`), untouched — not applied, not dropped.
- **Lint / TypeScript / tests / build — all re-run from scratch, all match
  the Phase 8 report exactly**: `npm run lint` 0 errors/warnings, `tsc
  --noEmit` clean, full suite **24 files / 106 tests passing**, `npm run
  build` clean with `/` still `○` static at 117 kB/220 kB First Load JS.
  Nothing in the claimed milestone was overstated.
- **Stash contents, inspected (not applied)**: `stash@{0}` contains exactly
  one file, `app/layout.tsx` (+14/−2 lines) — the `headers()`-based
  Accept-Language → `<html lang/dir>` change described in Phase 8, nothing
  unrelated. **Correction to the Phase 8 writeup**: the stash is *not* a
  complete, re-appliable implementation on its own. `lib/i18n.server.ts` and
  `lib/i18n.server.test.ts` (the `langFromAcceptLanguage`/`dirFromLang`
  functions that stashed `layout.tsx` imports) were deleted with a plain
  `rm` while still untracked by git, before they were ever committed —
  `git log --all` confirms no commit ever contained them, and a plain
  `rm` on untracked files leaves nothing for `git stash`, any commit, or
  `git fsck` to recover. The stashed `layout.tsx` diff alone would not build
  (missing import). If this fix is wanted later, `lib/i18n.server.ts` needs
  to be rewritten from the description in
  `docs/narrative-i18n-rtl-audit.md` — it is not sitting ready to reapply.
- **I18-4 decision re-examined, no new action taken**: confirmed
  `app/layout.tsx` still ships static `<html lang="en">`, and
  `app/page.tsx`'s existing effect (`autoFromNavigator()` →
  `autoFromCountry()` → `document.documentElement.lang/dir`) still runs and
  is the only thing correcting it, client-side, after mount — unchanged,
  still the full extent of "current language behavior." No demonstrated
  functional defect in that behavior (no hydration warnings, no visible
  wrong-direction flash reported or found) — only the already-documented,
  crawler-only `lang="en"` mismatch for visitors who never execute JS. Per
  instruction to prefer current working behavior absent a demonstrated
  defect: **no change made.** A theoretical static-compatible alternative
  (Edge Middleware rewriting the static HTML's `lang` attribute at the byte
  level, so `/` stays CDN-cacheable) was considered but not implemented —
  it can't be verified in this sandbox (no real Edge/CDN deployment to test
  chunk-boundary and caching-header interactions against), so implementing
  it un-verified would violate the same "don't ship what you can't verify"
  standard Phase 8 applied to the `headers()` approach. Left exactly as
  documented in Phase 8: a human decision, not implemented.
- **No work discarded.** Nothing was reset, cleaned, or stash-dropped.

**No blockers to report beyond the pre-existing ones** (Supabase live
verification, real third-party API keys, `npm audit` advisories) — all
already on record from earlier phases, untouched here. Realtime presence
and all other new feature work remain explicitly out of scope for this
checkpoint.

---

## Update — Phase 9: Internationalization, RTL/accessibility, and performance audit (2026-10-19)

Full record in `docs/i18n-a11y-performance-audit.md`. Summary:

- **i18n**: confirmed 9 languages from source, re-verified the existing
  translation-completeness checker (`npm run i18n:check`, already CI-gated)
  still reports zero missing keys. Found and fixed the one real gap: the
  language-gate's own `aria-label` and footer text were hardcoded English,
  never translated — added `gate.aria`/`gate.footer` keys to all 9
  dictionaries and wired them to the auto-detected language. Documented
  (not changed) three deliberate exceptions: the root crash-fallback text,
  single-language `<head>` metadata, and the AI concierge's unenforced
  "respond in this language" instruction.
- **Accept-Language (I18-4)**: re-examined, not re-implemented. Confirmed
  no functional defect in the current client-side-correction behavior;
  confirmed no verifiable static-compatible alternative exists in this
  sandbox. No dynamic rendering introduced — `/` stays `○` static.
- **RTL/accessibility**: fixed 3 real bugs (an unhidden decorative marker
  polluting a button's accessible name; a screen-reader-silent "hidden gem"
  indicator; no dismissible overlay closed on Escape — fixed app-wide with
  one new shared hook, `engine/useEscapeToClose.ts`, across 6 components).
  Wired `prefers-reduced-motion` into every framer-motion UI transition app-
  wide via `<MotionConfig reducedMotion="user">` (previously only the big
  WebGL/motion-intensity systems respected it). Measured real WCAG contrast
  ratios against the actual palette formulas across 6 moods — found one
  real sub-AA case (`accent` text in "Palefire"/winter-day mode, 3.38:1),
  documented with exact numbers as a design decision, not silently
  recolored. Confirmed already-correct: focus rings (never suppressed), no
  directional icons to mis-mirror, map-control labels, dropdown anchor
  logic.
- **Performance**: measured bundle before/after (118 kB/221 kB vs. the
  prior phase's 117 kB/220 kB — a real, small, reported-honestly increase
  from this phase's own additions). Found and removed one fully-unused
  dependency, `gsap` (never imported anywhere in source, 6.4 MB on disk) —
  corrects a since-Phase-5 open question in `IMPLEMENTATION_PLAN.md`'s
  `PRF-2`. Re-read `ParticleField.tsx` and `NeuralMap.tsx` fresh for
  rerenders/leaks — both already well-architected (R3F's own GL disposal;
  the "latest ref" pattern avoiding effect churn); no changes needed.
- **Adaptive experience**: `PRF-1` (particle density not scaled by device
  perf tier) re-confirmed as a still-deliberate, unchanged product
  decision — added a regression test that would fail if a future change
  accidentally altered it, instead of touching the decision itself.

**One real bug caught by writing a test, not by inspection**:
`langFromNavigator()`'s SSR-safety guard checked `typeof navigator ===
"undefined"`, which Node 18+'s own built-in global `navigator` silently
defeats (confirmed: Node 22's `navigator.language` returns `"en-US"`).
Never a live bug (only ever called from inside a client effect), but the
guard's own claim was wrong; fixed to guard on `window` instead, matching
this codebase's own correct idiom elsewhere.

Full suite: **29 files / 139 tests, all passing** (was 24/106 — +5 files,
+33 tests). Both Playwright specs passing
(`tests/e2e/rtl.spec.ts`, `tests/e2e/reduced-motion.spec.ts`). Verified:
lint (0 errors/warnings), `tsc --noEmit` (clean), production build (clean,
`/` still `○` static).

**Remaining items requiring human action/decision**:
1. The Accept-Language/static-rendering tradeoff (unchanged from the
   checkpoint note above).
2. The "Palefire" accent-text contrast finding (3.38:1, below AA) —
   needs a palette-level decision, not a mechanical fix.
3. AI concierge response language is instructed but not verified —
   spot-check once a real `ANTHROPIC_API_KEY` is configured.
4. 9-language terminology-consistency review — needs native speakers per
   language, not attempted here beyond one spot-check.
5. Pre-existing items unchanged: Supabase live verification, real
   third-party API keys, remaining `npm audit` advisories (now 17: 3
   moderate/11 high/3 critical, all transitive dev-tooling — same category
   as the original baseline, number differs because the advisory database
   itself changed since, not because of anything in this phase).
