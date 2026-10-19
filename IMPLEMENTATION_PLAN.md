# ECHO EARTH — Production Implementation Roadmap

Status: **planning only — nothing in this document has been implemented.**
Baseline reference: `PROJECT_STATUS.md` (install/lint/build/runtime all PASS, zero
env vars, demo mode confirmed working end-to-end).

## Ground rules this plan follows

- **Preserve what works.** The living-organism interface, the environment engine,
  the deterministic recommender, and the deterministic City Consciousness narrator
  are all well-built and are kept as the foundation. Nothing here proposes a
  rewrite of a working system without a concrete, cited defect driving it.
- **Order is by dependency, not by the numbering in the brief.** Testing and
  environment/config scaffolding (brief section 12) are pulled to the front
  because almost every later phase needs them to be verifiable and safe. Where a
  phase number differs from the brief's section number, that's why.
- **Every "CURRENT STATE" below is grounded in code actually read in this repo**
  (not assumed) — file paths and line references are from the current tree at
  commit `c989e81`.

## ID scheme

| Prefix | Area |
|---|---|
| `FND` | Foundation & tooling |
| `CORE` | Core application preservation/polish |
| `DAT` | Real data & API hardening |
| `SUP` | Supabase persistence |
| `MEM` | User memory & personalization |
| `REC` | Recommendation engine |
| `AIC` | AI Concierge (LLM layer) |
| `CNS` | City Consciousness |
| `RTP` | Realtime presence |
| `I18` | Multilingual system |
| `PRF` | Performance |
| `SEC` | Security |
| `TST` | Testing architecture (consolidation) |
| `SEO` | SEO / social |
| `PRD` | Production readiness |

---

## PHASE 0 — Foundation & Tooling
*(brief section 12, pulled forward: nothing downstream is safely verifiable without this)*

### FND-1 — Testing harness
**Current state:** No test runner, no test files anywhere in the repo (`package.json`
has no `test` script). `npm run build`/`lint`/`tsc` are the only existing checks.
**Problem:** Every phase below is asked to ship "tests" and a "testable pipeline,"
but there's nowhere to put them yet.
**Proposed solution:** Add Vitest (unit/integration — fast, ESM-native, works well
with Next.js + TS path aliases) for `engine/`, `lib/`, and API-route logic; add
Playwright for the small set of critical end-to-end flows (language gate → field
loads → place opens → concierge journey). Wire both into `package.json` scripts
(`test`, `test:watch`, `test:e2e`).
**Files affected:** `package.json`, new `vitest.config.ts`, `playwright.config.ts`,
new `tests/` or co-located `*.test.ts` files, `tsconfig.json` (test types).
**Dependencies:** none.
**Acceptance criteria:** `npm test` runs and passes on a trivial smoke test;
`npm run test:e2e` launches a browser against `next dev` and passes one flow.
**Tests:** the harness *is* the deliverable; validate with one placeholder unit
test and one placeholder e2e test before building on it.
**Security considerations:** none.
**Performance considerations:** keep Playwright e2e suite deliberately small (per
brief: "do not attempt to test every animation visually") so CI stays fast.

### FND-2 — Environment & config validation
**Current state:** `process.env.X` is read ad hoc in `app/api/*/route.ts` and
`components/map/LivingMap.tsx` with no validation; `.env.example` documents 7 keys
with no enforcement of which are server-only vs. client-exposed beyond Next's
`NEXT_PUBLIC_` convention (which is correctly used today — confirmed by reading
every API route and `LivingMap.tsx`).
**Problem:** As more server-only secrets are added (Anthropic key, Supabase service
role key), an accidental `NEXT_PUBLIC_` typo or a stray client import becomes a
real leak vector. There's also no single source of truth for "what env vars exist
and what do they unlock," so `.env.example` can drift from reality (it already
undersells the app: it says "8-language i18n" in docs while code has 9 languages —
same class of drift risk).
**Proposed solution:** A single `lib/env.server.ts` (server-only, never imported
by client components) using `zod` to parse and validate `process.env` once at
startup, exporting a typed `env` object. A parallel `lib/env.client.ts` for the
handful of `NEXT_PUBLIC_*` values. A lint rule / import boundary (eslint
`no-restricted-imports` scoped by directory, or a simple CI grep) that fails the
build if `env.server` is imported from a `"use client"` file.
**Files affected:** new `lib/env.server.ts`, `lib/env.client.ts`,
`eslint.config.mjs`, all `app/api/*/route.ts`, `components/map/LivingMap.tsx`.
**Dependencies:** FND-1 (to test the validator).
**Acceptance criteria:** missing/malformed required env vars fail fast with a
clear error at boot, not a silent `undefined` deep in a fetch call; a CI check
fails if a server-only env var is referenced from client code.
**Tests:** unit tests for the zod schemas (valid/invalid inputs); a static-analysis
test asserting no `"use client"` file imports `env.server`.
**Security considerations:** this is the task that directly prevents the Supabase
service-role key or Anthropic key from ever reaching the browser bundle — see
SEC-4 for the verification step.
**Performance considerations:** negligible (startup-only parse).

### FND-3 — Observability scaffold (logging + error boundaries)
**Current state:** No structured logging; errors in API routes are silently
swallowed into fallback behavior (by design, for resilience — see `app/api/*`
`catch { /* fall through */ }` blocks) but that means a real outage (e.g. Google
Places quota exhausted) is invisible. No React error boundary wraps `app/page.tsx`;
a thrown render error currently blanks the whole organism.
**Proposed solution:** A minimal structured server logger (`lib/log.ts`, JSON lines
to stdout — Vercel captures this natively) that records which branch each API
route took (`live` vs `echo` vs `error:<reason>`) without logging PII or full
payloads. A top-level React error boundary in `app/layout.tsx` around `children`
with a calm, on-brand fallback ("the organism lost its signal — reload"), plus
per-widget boundaries around `ParticleField`/`LivingMap`/`Concierge` so a WebGL or
third-party script failure doesn't blank the whole page.
**Files affected:** new `lib/log.ts`, new `components/ErrorBoundary.tsx`,
`app/layout.tsx`, `app/api/geo/route.ts`, `app/api/weather/route.ts`,
`app/api/places/route.ts`.
**Dependencies:** FND-2 (env for log level/sink config).
**Acceptance criteria:** a forced API failure (invalid upstream response) produces
one log line with route + branch + reason, no stack trace of user data; a forced
render error in `ParticleField` leaves the rest of the UI usable.
**Tests:** unit test that the logger redacts/doesn't include lat/lon or IP; e2e
test that throwing inside a boundary-wrapped component doesn't crash the page.
**Security considerations:** log redaction is the main concern — never log raw
IP, exact lat/lon, or API keys.
**Performance considerations:** logging must be fire-and-forget / non-blocking in
request handlers.

### FND-4 — Supabase project wiring (client factories only — no feature tables yet)
**Current state:** `supabase/schema.sql` exists (visitors, affinities,
interactions, saved_places, ai_suggestions, city_moods, with RLS policies) but
**zero application code references Supabase** — confirmed via repo-wide grep; no
`@supabase/supabase-js` dependency in `package.json`.
**Problem:** Before any table is used (Phase 2), the project needs a correct,
reusable pattern for *two different Supabase clients*: a browser anon-key client
(RLS-enforced) and a server service-role client (RLS-bypassing, server-only) —
conflating these is the single most common Supabase security mistake.
**Proposed solution:** Add `@supabase/supabase-js` and `@supabase/ssr`. Create
`lib/supabase/client.ts` (browser, anon key only, safe to import from `"use
client"` components) and `lib/supabase/server.ts` (service role, imports
`env.server`, throws if accidentally imported client-side — enforced by the same
boundary check from FND-2). Set up `supabase/migrations/` via the Supabase CLI so
`schema.sql` becomes the first tracked migration instead of a hand-run script.
**Files affected:** `package.json`, new `lib/supabase/client.ts`,
`lib/supabase/server.ts`, `supabase/migrations/0001_init.sql` (moved from
`schema.sql`), new `supabase/config.toml`.
**Dependencies:** FND-2.
**Acceptance criteria:** `supabase db push`/`supabase migration up` against a local
Supabase instance applies cleanly; importing `lib/supabase/server.ts` from a
`"use client"` file fails the boundary check from FND-2.
**Tests:** a CI job that runs `supabase start` (local Postgres via Docker) and
applies migrations as a smoke test (also used later by SUP tasks).
**Security considerations:** this task's entire purpose is isolating the
service-role key server-side — see SEC-4 for the final audit gate.
**Performance considerations:** none at this stage (no queries yet).

---

## PHASE 1 — Core Application Preservation & Light Polish
*(brief section 1 — small, independent, no-rewrite fixes to the existing experience)*

### CORE-1 — Remove dead `Awakening.tsx`
**Current state:** `components/organism/Awakening.tsx` (88 lines) is not imported
anywhere except referenced in the now-stale `ARCHITECTURE.md` — confirmed via
repo-wide grep. It was superseded by `components/planet/PlanetaryEntry.tsx`
(commit `93acb1d`, "Living Earth entry") but never deleted.
**Problem:** Dead code that will confuse the next contributor into thinking there
are two possible entry sequences.
**Proposed solution:** Delete the file; update `ARCHITECTURE.md`'s UX-flow section
to describe `PlanetaryEntry` instead of `Awakening`.
**Files affected:** delete `components/organism/Awakening.tsx`, edit
`ARCHITECTURE.md`.
**Dependencies:** none.
**Acceptance criteria:** `npm run build` still passes; no remaining references.
**Tests:** none needed beyond existing build/lint.
**Security considerations:** none. **Performance considerations:** marginally
smaller repo/bundle (it was never bundled anyway, since unreferenced).

### CORE-2 — Refresh `ARCHITECTURE.md` against actual file tree
**Current state:** `ARCHITECTURE.md`'s folder listing (§2) predates
`concierge/`, `planet/`, `about/`, `i18n/`, `engine/consciousness.ts`,
`lib/itinerary.ts`, `components/hud/HudMenu.tsx`, `app/sitemap.ts`/`robots.ts` —
all added in commits after the doc was last touched.
**Problem:** Docs drift actively misleads anyone (human or AI) planning further
work, as seen in this very roadmap process (recon had to re-derive the real tree).
**Proposed solution:** Regenerate §2 and §8 (UX flow) from the current tree;
correct "8-language i18n" → "9-language" (en/ar/fr/zh/es/ru/el/tr/de, confirmed in
`lib/i18n.ts`).
**Files affected:** `ARCHITECTURE.md`.
**Dependencies:** CORE-1 (so the doc reflects the post-cleanup tree).
**Acceptance criteria:** every file under `app/`, `engine/`, `components/`, `lib/`
is mentioned somewhere in `ARCHITECTURE.md` §2.
**Tests:** none (docs-only). **Security/Performance considerations:** none.

### CORE-3 — HUD dropdown accessibility pass
**Current state:** `components/hud/HudMenu.tsx` consolidates sensor chips into a
dropdown (commit `c5edd8c`). Lint already flags one real issue:
`HudMenu.tsx:67` — `aria-pressed` on an element with `role="menuitem"`, which
`jsx-a11y` correctly says is invalid ARIA (menuitem doesn't support pressed
state).
**Problem:** The existing lint warning is a genuine accessibility bug, not noise —
screen readers won't announce the toggle state correctly.
**Proposed solution:** Use `role="menuitemcheckbox"` with `aria-checked` instead
of `role="menuitem"` + `aria-pressed` for the toggle item(s) in the dropdown
(matching the existing `radiogroup`/`aria-checked` pattern already used
correctly elsewhere, e.g. `Concierge.tsx`'s tourist/local toggle).
**Files affected:** `components/hud/HudMenu.tsx`.
**Dependencies:** none.
**Acceptance criteria:** `npm run lint` drops from 5 to 4 warnings; manual
screen-reader check (NVDA/VoiceOver) announces the toggle state.
**Tests:** a Playwright accessibility assertion (axe-core) on the HUD dropdown.
**Security considerations:** none. **Performance considerations:** none.

### CORE-4 — Audio engine lifecycle audit
**Current state:** `engine/audio.ts` (223 lines) manages a WebAudio graph
(weather bed, sub pulse, blips) that's opt-in via a HUD toggle. Not yet verified:
whether the `AudioContext` is suspended when the tab is backgrounded/hidden, and
whether iOS Safari's autoplay-gesture requirement is handled gracefully (silent
failure vs. visible "tap to enable sound" state).
**Problem:** An un-suspended `AudioContext` on a backgrounded mobile tab burns
battery for no perceptible benefit — directly relevant to brief §10's "battery
usage" ask, and to the README's own "Survival Mode" battery-consciousness.
**Proposed solution:** Add a `visibilitychange` listener that suspends/resumes the
shared `AudioContext`; confirm (and if missing, add) a user-gesture-gated resume
path for iOS; add a one-line fallback state in the HUD sound toggle if
`AudioContext` creation is rejected.
**Files affected:** `engine/audio.ts`, `components/hud/VitalsHUD.tsx` (toggle
affordance only).
**Dependencies:** FND-1 (to test the suspend/resume behavior).
**Acceptance criteria:** backgrounding the tab with sound on measurably drops CPU
in dev tools' performance monitor; iOS Safari doesn't throw an unhandled
`NotAllowedError` in the console.
**Tests:** unit test mocking `document.visibilityState` transitions and asserting
`suspend()`/`resume()` calls.
**Security considerations:** none.
**Performance considerations:** this *is* the performance/battery fix — ties into
PRF-3.

### CORE-5 — Mobile/responsive regression pass
**Current state:** Recent commits already fixed real issues here (`de836a7` "Fix
bottom controls being clipped on desktop", `d897d07` "Render identically on all
devices: drop performance-tier visual scaling", `3eb6ea6` "Unify HUD across
devices"). The app is in reasonable shape, but there's no regression test
preventing the clipping bug from recurring, and `d897d07` is also the commit that
removed the performance-tier system now flagged as a real problem in PRF-1.
**Problem:** No automated guard against the exact class of bug already fixed
twice (controls clipped on short viewports).
**Proposed solution:** Add a Playwright viewport matrix (a small set: iPhone SE
width, a short laptop window, a tablet) asserting the mood-mode row and category
orbs are within the viewport bounds (`element.boundingBox()` fully inside
`page.viewportSize()`), not a full visual-diff suite.
**Files affected:** new `tests/e2e/responsive.spec.ts`.
**Dependencies:** FND-1.
**Acceptance criteria:** the test fails if the clipping regression from `de836a7`
is reintroduced (verify by reverting that commit locally and confirming red).
**Tests:** the Playwright spec itself.
**Security considerations:** none. **Performance considerations:** none.

---

## PHASE 2 — Real Data & API Hardening
*(brief section 2)*

### DAT-1 — Shared fetch utility: timeout, retry, and per-route rate limiting
**Current state:** Each API route (`app/api/geo`, `weather`, `places`) hand-rolls
its own `fetch` + `try/catch` + fallback. `app/api/geo/route.ts` sets an explicit
3.5s timeout on the `ipapi.co` call (good); `weather` and `places` have no
timeout at all, so a slow upstream could hang the request until Vercel's
platform timeout. None of the three routes rate-limit the caller — observed
directly in the baseline check: nothing stops `curl` from hammering
`/api/places` in a loop, which would exhaust a real Google Places quota fast.
**Problem:** Missing per-request timeouts risk hung requests; missing rate
limiting is a cost/abuse risk once real API keys are in production (brief §11
explicitly calls for this).
**Proposed solution:** A small shared `lib/fetchWithTimeout.ts` helper (used by
all three routes) and a lightweight in-memory + edge-compatible rate limiter
(`@upstash/ratelimit` backed by Vercel KV/Upstash Redis — works on edge runtime,
matching `app/api/geo`'s `export const runtime = "edge"`) keyed by IP, applied to
all three routes.
**Files affected:** new `lib/fetchWithTimeout.ts`, new `lib/rateLimit.ts`,
`app/api/geo/route.ts`, `app/api/weather/route.ts`, `app/api/places/route.ts`.
**Dependencies:** FND-2 (env for Redis URL), FND-3 (log rate-limit rejections).
**Acceptance criteria:** all three routes return within a bounded time even if an
upstream hangs; exceeding a sane per-IP request budget returns `429` with the
existing demo/fallback data still usable client-side (never a hard block of the
UI).
**Tests:** unit tests for the timeout helper (fake slow fetch resolves/rejects
correctly); integration test hitting a route past its limit and asserting `429`.
**Security considerations:** this *is* a security task (abuse/cost prevention,
brief §11) as much as a data-reliability one — cross-referenced at SEC-2.
**Performance considerations:** rate-limit check must be O(1) (Redis `INCR` +
`EXPIRE`), not add meaningful latency.

### DAT-2 — Google Places integration: richer data + explicit quota handling
**Current state:** `app/api/places/route.ts`'s `googleNearby()` requests a narrow
field mask (id, name, location, rating, review count, price level, open-now,
short address) and treats any non-OK response identically (fall back to demo).
It does not distinguish "quota exceeded" (should maybe retry with backoff or
surface a distinct log) from "invalid key" (should log once per cold start, not
per-request) from "no results" (legitimate empty area).
**Problem:** Brief §2 explicitly asks to evaluate "opening hours, place
categories, distance, ratings, availability of places" — opening hours today is
only a boolean `openNow`, with no hours detail for display ("open until 11pm");
distance/rating/category are already solid. All failures collapse to the same
demo fallback, which is correct behavior but makes a real production quota
problem invisible (fixed by FND-3's logging).
**Proposed solution:** (a) Extend the field mask to include
`regularOpeningHours.weekdayDescriptions` for the detail panel's "open until X"
line; (b) classify the failure reason in the log (401/403 = key problem, 429 =
quota, other = transient) via DAT-1's shared fetch + FND-3's logger; (c) add a
short (5 min, matching the existing Next `revalidate: 300`) in-memory/edge cache
keyed by `lat,lon,category` rounded to ~100m grid cells, so nearby
requests within the cache window don't re-hit the API — this is a cost control,
not a UX change.
**Files affected:** `app/api/places/route.ts`, `lib/places.ts` (extend `Place`
type with optional `hoursToday?: string`), `components/discovery/PlaceDetail.tsx`
(render the new field if present).
**Dependencies:** DAT-1, FND-3.
**Acceptance criteria:** with a real key (provided later by you), `PlaceDetail`
shows real hours when available and nothing extra when not (demo places simply
lack the field); failure-reason log lines appear correctly for a simulated 403
and a simulated 429 (mockable without a real key).
**Tests:** unit test for the grid-cell cache key function; unit test for the
field mask/parsing with a fixture Google response including/excluding
`regularOpeningHours`.
**Security considerations:** no new surface — same server-only key usage as
today.
**Performance considerations:** the grid-cell cache meaningfully cuts API spend
for visitors who pan/zoom the map without moving far.

### DAT-3 — OpenWeather integration hardening
**Current state:** `app/api/weather/route.ts` already has a solid synthesis
fallback and correct key-gating; it has no request timeout (see DAT-1) and no
distinction between "key present but invalid" vs "network error" in logs.
**Problem:** Minor relative to Places, but same class of invisibility.
**Proposed solution:** Apply DAT-1's timeout helper and FND-3's branch logging;
no behavioral change otherwise — this system doesn't need more than that.
**Files affected:** `app/api/weather/route.ts`.
**Dependencies:** DAT-1, FND-3.
**Acceptance criteria:** same bounded-latency guarantee as DAT-1; log line per
branch taken.
**Tests:** unit test for the synthesis function's determinism (same lat + same
day → same output — this is already true by construction via the `day` seed, so
the test is a regression guard, not a new behavior).
**Security considerations:** none. **Performance considerations:** none beyond
the shared timeout.

### DAT-4 — Geolocation accuracy: reconcile IP-guess with browser GPS
**Current state:** `app/api/geo/route.ts` provides an IP-based first guess
(edge headers → `ipapi.co` → hardcoded Nairobi fallback — all three paths
verified working in the baseline check). `engine/useEnvironment.ts` is
documented as doing a "geolocation (IP→GPS upgrade)" per the README, which
implies browser `navigator.geolocation` later refines the IP guess — this exists
in the code (not fully re-read line-by-line here) but its *permission-denied* and
*timeout* paths weren't exercised in the baseline check.
**Problem:** Brief §2 asks to evaluate geolocation specifically. The main risk is
a visitor who denies the GPS permission prompt getting stuck on a stale/wrong IP
city with no way to manually correct it.
**Proposed solution:** Audit `useEnvironment.ts`'s GPS-upgrade path for explicit
handling of `PERMISSION_DENIED`/`TIMEOUT`/`POSITION_UNAVAILABLE` (not just the
success path); add a manual "search city" override in the HUD as a last-resort
correction (lightweight — a text input that geocodes via the same Google Places
Autocomplete the app already evaluates, or a simple city-name lookup) **only if**
the audit finds no existing recovery path.
**Files affected:** `engine/useEnvironment.ts` (audit + fix only if needed),
possibly `components/hud/HudMenu.tsx` (manual override UI).
**Dependencies:** none (independent of Supabase/AI work).
**Acceptance criteria:** denying the geolocation permission prompt in a real
browser leaves the app fully usable on the IP-guessed city, with no dead-end
state.
**Tests:** unit test mocking `navigator.geolocation.getCurrentPosition`'s error
callback for each `PositionError` code.
**Security considerations:** geolocation is already appropriately coarse by
default (IP-level) with GPS as an explicit opt-in browser permission — no change
to that model.
**Performance considerations:** none.

### DAT-5 — Fallback-mode UX confirmation (no code change — verification task)
**Current state:** Fully verified working in the baseline check: `/api/geo`,
`/api/weather`, `/api/places` all degrade correctly with zero keys, and the HUD
correctly labels the result "demo city · no API key."
**Problem:** None currently — this task exists to make sure DAT-1 through DAT-4
don't regress it.
**Proposed solution:** Add the demo-mode flow (already manually verified) as a
permanent Playwright regression test rather than a one-off manual check.
**Files affected:** new `tests/e2e/demo-mode.spec.ts`.
**Dependencies:** FND-1, DAT-1 through DAT-4 (runs after, as a safety net).
**Acceptance criteria:** test asserts the "demo city · no API key" label appears
and at least one synthesized place renders, with zero env vars set in the test
environment.
**Tests:** this task is a test. **Security/Performance considerations:** none.

---

## PHASE 3 — Supabase Persistence
*(brief section 3 — the single biggest gap found in reconnaissance: schema exists, zero code uses it)*

### SUP-1 — Anonymous visitor identity & session bootstrap
**Current state:** `useAdaptiveMind` already generates a per-device identity
concept implicitly via its persisted zustand store (`name: "ee-mind"` in
localStorage) but there is no `client_seed` concept wired to the `visitors` table
at all — the schema's anonymous-first design (`visitors.client_seed`) is
currently unused.
**Problem:** Before any other Supabase table can be written safely under RLS, the
app needs a stable, unspoofable-enough visitor identity that RLS policies can key
on. The *current* schema's RLS (`user_id = auth.uid() or user_id is null`) is
actually a real security gap: "or `user_id is null`" means **any** anonymous
visitor row is readable/writable by **any** other anonymous caller using the
anon key, since nothing ties a request to a specific `client_seed` — this must be
fixed, not just "implemented as-is" (see SUP-2).
**Proposed solution:** Use Supabase Anonymous Sign-ins
(`supabase.auth.signInAnonymously()`), which issues a real `auth.uid()` per
browser/device backed by a Supabase-managed JWT in a cookie — this makes
`user_id` non-null for every visitor (anonymous or not) and lets RLS key
correctly on `auth.uid()` everywhere, closing the gap in one move instead of
reinventing session tokens.
**Files affected:** new `engine/useSupabaseSession.ts` (calls
`signInAnonymously()` once on mount, persists nothing extra — Supabase handles
the session cookie/token), `app/page.tsx` (wire the hook), `supabase/migrations/`
(new migration enabling anonymous sign-ins per Supabase project settings notes).
**Dependencies:** FND-4.
**Acceptance criteria:** a fresh browser session gets a Supabase `auth.uid()`
within one render cycle, before any table write is attempted; the same device
reusing the browser keeps the same `auth.uid()` across reloads (Supabase persists
the anon session in storage).
**Tests:** integration test against local Supabase: two separate anon sessions
get two distinct `auth.uid()`s; the same session reloaded keeps its uid.
**Security considerations:** this is the fix for the RLS gap described above —
see SUP-2's acceptance criteria for the closed-loop verification.
**Performance considerations:** anonymous sign-in is one extra network round
trip on first load — done in parallel with existing geo/weather fetches, not
blocking the critical render path.

### SUP-2 — RLS policy correction
**Current state:** `supabase/schema.sql`'s policies use `user_id = auth.uid() or
user_id is null` on `visitors`, `affinities`, `interactions`, `saved_places`. As
written, this is **not actually private per-visitor** — it's "private to
authenticated users, public to anyone still using the anon key with no
session," which every browser client currently would be, absent SUP-1.
**Problem:** Brief explicitly says "Ensure Row Level Security is correct" — this
is the concrete correctness bug to fix.
**Proposed solution:** Once SUP-1 guarantees every visitor has a non-null
`auth.uid()`, simplify every policy to the strict form:
`using (user_id = auth.uid())` (drop the `or user_id is null` escape hatch
entirely) and add a `with check (user_id = auth.uid())` clause on insert/update
policies so a client can't write a row claiming someone else's `user_id`.
Migrate `visitors.client_seed` to be set *from* `auth.uid()` at insert time
server-side (a Postgres trigger or an RPC function), not client-supplied, so it
can't be spoofed either.
**Files affected:** new `supabase/migrations/0002_rls_fix.sql`.
**Dependencies:** SUP-1.
**Acceptance criteria:** a Postgres-level test (pgTAP or a plain SQL test script
run via the CI's local Supabase instance) proves: session A cannot `select`,
`update`, or `delete` session B's `visitors`/`affinities`/`interactions`/
`saved_places` rows, using the anon key + two different anonymous JWTs.
**Tests:** the pgTAP/SQL test above is the deliverable test, run in CI against
`supabase start`.
**Security considerations:** this task *is* the security fix — flagged again at
SEC-3 as a required gate before any production Supabase credentials are used.
**Performance considerations:** none (RLS policy evaluation cost is
negligible at this scale).

### SUP-3 — Preferences & affinities sync (bidirectional, local-first)
**Current state:** `engine/useAdaptiveMind.ts` is a fully-working local-only
affinity/mode/energy store (decay-weighted category affinities, night-quiet
bias, travel mode) persisted to `localStorage` only. The `affinities` table
exists in the schema but nothing writes to it.
**Problem:** Brief §4 wants long-term memory to survive device changes; §3 wants
`affinities` actually implemented. The existing client-side logic is good and
should **not** be rewritten — it should be mirrored to Supabase, debounced, with
the local store remaining the source of truth for *instant* UI feedback (no
request round-trip on every category tap).
**Proposed solution:** A thin sync layer (`engine/useMemorySync.ts`) that
subscribes to `useAdaptiveMind`'s affinity changes, debounces (~5s idle or on
page unload via `navigator.sendBeacon`), and upserts to `affinities` keyed by the
now-correct `auth.uid()`. On load, if a Supabase row set exists and
`localStorage` is empty (new device), hydrate `useAdaptiveMind`'s initial state
from Supabase instead of starting cold — this is the "cross-device memory" the
README already promises.
**Files affected:** new `engine/useMemorySync.ts`, `engine/useAdaptiveMind.ts`
(expose a hydration setter, minimal change — no behavioral rewrite),
`app/page.tsx` (mount the sync hook).
**Dependencies:** SUP-2, FND-4.
**Acceptance criteria:** clearing `localStorage` but keeping the same (test)
Supabase anon session restores the same learned affinities on next load; a brand
new session with no Supabase rows behaves exactly as today (cold start, no
regression).
**Tests:** integration test: simulate affinity changes, flush sync, clear local
store, reload hook, assert hydration matches.
**Security considerations:** writes go through the anon client under the fixed
RLS from SUP-2 — never the service-role client.
**Performance considerations:** debounced + beacon-based writes so this never
blocks interaction; sync failure must never block or lag the UI (same
fail-open philosophy as the existing API routes).

### SUP-4 — Interactions telemetry pipeline
**Current state:** `interactions` table exists (kind, category, place_ref, mood,
travel, weather, phase) but nothing writes to it. Client already *has* most of
this context at the moment of each action (`pickCategory`, `pickPlace`,
`focusPlace` in `app/page.tsx`).
**Problem:** Brief §4 lists "viewed places, saved places, dismissed places,
searches, journeys" as personalization signals that need capturing somewhere.
**Proposed solution:** A single `recordInteraction(kind, ctx)` helper called from
the existing interaction handlers already in `app/page.tsx` (`pickCategory`,
`focusPlace`, `pickPlace`, mode changes, sound toggle) — batched client-side
(array buffer, flushed every ~10s or 20 events via a single `insert` of multiple
rows, not one request per tap) to keep write volume sane.
**Files affected:** new `lib/telemetry.ts`, `app/page.tsx` (call sites),
`components/concierge/Concierge.tsx` (journey-related events).
**Dependencies:** SUP-2.
**Acceptance criteria:** a full interactive session produces a bounded number of
Supabase writes (batched, not 1:1 with UI events); no telemetry call is ever
`await`-blocking a UI interaction.
**Tests:** unit test for the batching/flush logic (time-based and
count-based triggers); integration test that a batch insert lands correctly.
**Security considerations:** no free-text fields (no raw search strings beyond a
constrained category/energy enum) go into `interactions` without a size/charset
cap, to keep this unusable as a stored-XSS or storage-abuse vector even though
it's never rendered back as HTML.
**Performance considerations:** batching is the performance control here —
directly limits write amplification.

### SUP-5 — Saved places CRUD
**Current state:** `saved_places` table exists; no UI affordance to save a place
exists anywhere in `components/discovery/PlaceDetail.tsx` (not yet re-read in
full, but no "save" references found in the repo-wide grep for Supabase/save
concepts beyond the schema itself).
**Problem:** This is a net-new, explicitly-requested feature (§3), not a
preservation task.
**Proposed solution:** Add a save/unsave affordance to `PlaceDetail.tsx`
(heart/star icon, optimistic UI update, backed by an upsert/delete against
`saved_places` under the fixed RLS), and a "Saved" filter accessible from the HUD
dropdown (reuses the existing `CategoryOrbs`/mood-lens filtering pattern rather
than inventing a new UI paradigm).
**Files affected:** `components/discovery/PlaceDetail.tsx`,
`components/hud/HudMenu.tsx`, new `lib/savedPlaces.ts`, `lib/recommend.ts`
(extend `filterPlaces` with a "saved" pseudo-mode, consistent with its existing
mode-filter pattern).
**Dependencies:** SUP-2.
**Acceptance criteria:** saving a place persists across a reload (same session);
unsaving removes it; works entirely through the anon client.
**Tests:** integration test for save/unsave round-trip against local Supabase;
component test for the optimistic-UI rollback path if the write fails.
**Security considerations:** RLS-scoped as above.
**Performance considerations:** optimistic update means no perceived latency on
tap.

### SUP-6 — `ai_suggestions` cache (server-write, public-read)
**Current state:** Table exists, designed for exactly this; depends on AIC
existing to have anything to cache. Covered procedurally here; implemented in
Phase 5 (AIC-4) once the AI layer exists. Listed here so the Supabase section is
complete — no separate Supabase-side work beyond what SUP-1/SUP-2 already
provide (the table's RLS — public read, service-role write — is already correct
in the existing schema and needs no change).
**Problem:** N/A — placeholder entry for dependency clarity.
**Proposed solution:** See AIC-4.
**Files affected:** see AIC-4. **Dependencies:** AIC-2.
**Acceptance criteria / Tests / Security / Performance:** see AIC-4.

### SUP-7 — `city_moods` aggregation
**Current state:** Table exists (aggregate per-city category popularity);
nothing populates it.
**Problem:** Brief §3 asks to evaluate/implement this; it's genuinely useful for
seeding new-visitor defaults per city per the existing `ARCHITECTURE.md` §7
design intent, but it is **not** on the critical path for the core experience —
flagged as lower priority than SUP-1 through SUP-5.
**Proposed solution:** A Supabase scheduled Edge Function (cron, e.g. hourly)
that aggregates `interactions` grouped by city + category into `city_moods`,
using the service-role client (server-only, scheduled context — never
browser-reachable). New visitors' `rankCategories` call in `lib/recommend.ts`
gets an optional `cityDefaults` parameter that nudges initial category order
before any personal affinity exists — additive, not a rewrite of the existing
scoring function.
**Files affected:** new `supabase/functions/aggregate-city-moods/index.ts`,
`lib/recommend.ts` (additive parameter only).
**Dependencies:** SUP-4 (needs interactions data to aggregate).
**Acceptance criteria:** running the function against seeded test interactions
produces correct aggregates; `rankCategories` with a `cityDefaults` argument
changes initial ordering only when the visitor has zero personal affinities yet.
**Tests:** unit test for the aggregation SQL/logic with fixture rows; unit test
for `rankCategories`'s new parameter (regression test: omitting it must produce
byte-identical output to today).
**Security considerations:** scheduled function runs server-side only, under
service-role, never exposed as a callable client endpoint.
**Performance considerations:** aggregation runs out-of-band (hourly cron), zero
impact on request-path latency.

### SUP-8 — Service-role isolation verification
**Current state:** N/A yet (no Supabase code exists).
**Problem:** This is the explicit closing check the brief asks for: "Do not
expose service-role credentials to the browser."
**Proposed solution:** A CI step that builds the production bundle
(`next build`) and greps the output `.next/static` and
`.next/server` client-reachable chunks for the literal service-role key value (or,
better, asserts `SUPABASE_SERVICE_ROLE_KEY` is never read outside files matching
`lib/supabase/server.ts` / `app/api/**/route.ts` / `supabase/functions/**`, via
the FND-2 import-boundary check).
**Files affected:** CI workflow config (see PRD-4), `lib/supabase/server.ts`.
**Dependencies:** FND-2, FND-4.
**Acceptance criteria:** CI fails if the service-role key pattern appears in any
client-bundled output, or if any `"use client"` file imports the server Supabase
client.
**Tests:** the CI check is the test — also add one deliberately-broken fixture
import in a test branch to prove the check catches it (then revert).
**Security considerations:** this task *is* the security control.
**Performance considerations:** none.

---

## PHASE 4 — User Memory & Personalization
*(brief section 4)*

### MEM-1 — Explicit session vs. long-term memory boundary
**Current state:** Today everything lives in one flat `useAdaptiveMind` zustand
store persisted wholesale to `localStorage` — mode, travel, atmosphere, energy,
affinities, visit/discovery counters are not currently distinguished as
"ephemeral this-session" vs. "durable across visits."
**Problem:** Brief §4 explicitly requires this distinction to be clear. Right
now, e.g., `mode` (mood lens) and `travel` (walking/driving) are transient
context that shouldn't "stick" indefinitely across unrelated future visits the
way `affinities` (learned taste) should.
**Proposed solution:** Split the single store into two zustand stores: a
non-persisted `useSession` (mode, travel, current category, current search/
view state — resets every load, matching how `mode`/`travel` conceptually behave
today anyway) and the existing `useAdaptiveMind` narrowed to genuinely durable
fields (affinities, visits, discoveries, nightQuietBias, last-chosen energy/
atmosphere as a *default*, not a forced state). This is a refactor of state
*location*, not of the learning logic itself (no rewrite of the decay math, the
travel-speed thresholds, or the affinity weights).
**Files affected:** `engine/useAdaptiveMind.ts` (split), new
`engine/useSession.ts`, `app/page.tsx` and all components reading these stores
(`CategoryOrbs`, `MoodModes`, `Consciousness`, `Concierge` — import path changes
only).
**Dependencies:** none technically, but sequenced here because SUP-3's sync
layer should sync the *correct* (durable-only) half, not the session half — do
MEM-1 before finishing SUP-3's rollout.
**Acceptance criteria:** reloading the page always resets `mode` to `explore` and
`travel` to `still` (or environment-detected) rather than restoring yesterday's
late-night mode on a Tuesday morning — this is actually a UX improvement over
today's behavior, where `mode` persists indefinitely in `localStorage`.
**Tests:** unit test per store asserting persistence config (`persist` applied to
`useAdaptiveMind`, explicitly absent from `useSession`).
**Security considerations:** none.
**Performance considerations:** none (same number of renders).

### MEM-2 — Expand captured signals
**Current state:** Today's signals: category picks (`noticeCategory`), discovery
opens (`recordDiscovery`), travel speed, mode/energy/atmosphere choice. Not yet
captured anywhere: dismissed places (no "not interested" affordance exists),
price-level preference (schema has `priceLevel` on `Place` but nothing learns
from it), explicit time-of-day preference (inferred only implicitly via
`nightQuietBias`).
**Problem:** Brief §4 lists these as required signals.
**Proposed solution:** (a) Add a lightweight "not for me" dismiss gesture on
`PlaceDetail`/map nodes that nudges the category affinity down (reuse
`noticeCategory`'s existing decay mechanism with a negative weight — no new
scoring system); (b) track a rolling average of chosen places' `priceLevel` into
a new durable field `priceAffinity: number (0-4)`; (c) keep time-of-day
inference as-is (`nightQuietBias` already does this well) rather than adding a
redundant explicit-preference toggle, unless MEM-4's preference center surfaces
a demand for it.
**Files affected:** `engine/useAdaptiveMind.ts` (new field + setter, additive),
`components/discovery/PlaceDetail.tsx` (dismiss gesture),
`components/map/NeuralMap.tsx` (optional node-level dismiss).
**Dependencies:** MEM-1.
**Acceptance criteria:** dismissing a place measurably lowers that category's
affinity on next `rankCategories` call; `priceAffinity` shifts toward
repeatedly-chosen price levels.
**Tests:** unit tests for the new reducer logic (pure function, easy to test in
isolation — same pattern as existing `noticeCategory` tests would be).
**Security considerations:** none.
**Performance considerations:** none (same O(categories) update cost).

### MEM-3 — Searches & journeys as signals
**Current state:** There is no free-text search anywhere in the app today (
discovery is entirely category/mood-driven) — so "searches" from brief §4 maps
onto the Concierge's "energy" selections and the regenerate/change actions,
which **are** already captured as `mind.energy` but not fed into
`rankCategories` or the AI context yet.
**Problem:** The signal exists in a form the UI already produces; it's just not
wired into personalization.
**Proposed solution:** Feed `mind.energy` (and its recency) into `rankCategories`
as an additional scoring input (same additive-term pattern already used for
mode/travel/phase/weather in `lib/recommend.ts`), and into the AI context
builder in Phase 5.
**Files affected:** `lib/recommend.ts` (additive scoring term), `app/page.tsx`
(pass `mind.energy` through to `rankCategories`'s call site).
**Dependencies:** MEM-1, REC-1 (ranking algorithm formalization, so this lands as
a documented term, not an ad hoc tweak).
**Acceptance criteria:** choosing a Concierge energy measurably shifts
`rankCategories`'s output toward that energy's associated categories, decaying
over a defined window (reuse the existing `favorites()`-style decay pattern).
**Tests:** unit test asserting the scoring delta.
**Security considerations:** none. **Performance considerations:** none.

### MEM-4 — Explicit preference center (user-facing privacy control)
**Current state:** No settings/privacy UI exists; all learned state is invisible
and uneditable by the visitor.
**Problem:** Brief §4 lists "explicit preferences" as a signal type, and good
practice (plus eventual privacy-law considerations) means a user should be able
to see and clear what's been learned about them, especially once it's mirrored
to Supabase (Phase 3).
**Proposed solution:** A small panel (reachable from the existing HUD dropdown,
consistent with where "About" and language switching already live) showing
current affinities/price preference in plain language ("you tend to pick cafés
and cocktail bars") with a single "forget my preferences" action that clears
both `localStorage` and the Supabase-side `affinities`/`interactions` rows for
that session.
**Files affected:** new `components/hud/PreferenceCenter.tsx`,
`components/hud/HudMenu.tsx`, `lib/savedPlaces.ts`/`lib/telemetry.ts` (delete
helpers).
**Dependencies:** SUP-3, SUP-4, MEM-1, MEM-2.
**Acceptance criteria:** "forget my preferences" leaves the app in the same cold
-start state as a brand-new visitor, both locally and in Supabase.
**Tests:** integration test that the delete action removes the relevant Supabase
rows under RLS (as the visitor's own session — proving they can delete only
their own data, reinforcing SUP-2).
**Security considerations:** this is a user-rights/privacy control — the delete
path must go through the anon client under RLS, never bypass it.
**Performance considerations:** none.

---

## PHASE 5 — Recommendation Engine
*(brief section 6 — formalized before AIC, since the AI layer must call into a stable, documented ranking core)*

**STATUS (2026-10-08): DONE** — implemented *after* AIC (Phase 6 in execution
order, since the AI layer existed first and this pass is what retrofits a
real shared engine underneath it, rather than the other way around).
`lib/recommend.ts` now exports a generic `ScorablePlace`-based
`scorePlace`/`rankPlaces`/`filterPlaces`/`buildValidCandidates` pipeline, used
by `app/page.tsx`, `lib/itinerary.ts`'s `composeJourney`, and
`lib/ai/buildContext.ts` — eliminating the three independent, duplicated
"best place" heuristics the audit found (see `docs/recommendation-engine.md`
for the full before/after trace, the scoring table, and what's still
explicitly out of scope — notably Supabase-synced memory, still `SUP-3`).
`lib/recommend.test.ts` (18 tests) and `lib/itinerary.test.ts` (10 tests) are
both new; neither file had any coverage before this pass.

### REC-1 — Extract and document the ranking algorithm
**Current state:** `lib/recommend.ts` already implements a clean, deterministic,
additive-scoring ranker (`rankCategories`) and a constraint filter
(`filterPlaces`) — genuinely good code, confirmed by direct reading. It is not
currently documented as a formal algorithm (no written scoring table), and it's
not unit-tested.
**Problem:** Brief §6 asks to "document the ranking algorithm" and "make the
recommendation pipeline testable" — both currently missing, even though the
underlying logic is sound and should not be rewritten.
**Proposed solution:** Write `docs/recommendation-algorithm.md` documenting the
exact scoring table (mode weights, travel weights, phase weights, weather
weights, favorites weights, and the new MEM-2/MEM-3 terms) as a readable
spec, generated *from* the code (keep `lib/recommend.ts` as the single source of
truth; the doc cites line ranges, it doesn't duplicate logic). Add a full unit
test suite covering every branch (`mode` × `travel` × `phase` × `weather`
combinations that matter) with hand-computed expected orderings for a handful of
representative cases.
**Files affected:** new `docs/recommendation-algorithm.md`, new
`lib/recommend.test.ts`.
**Dependencies:** FND-1.
**Acceptance criteria:** the doc and the code cannot silently drift because CI
fails if a documented example case's expected output changes without the doc
being updated in the same PR (a single "golden case" test with an inline comment
linking to the doc section).
**Tests:** the suite above — this task's main deliverable.
**Security considerations:** none.
**Performance considerations:** `rankCategories`/`filterPlaces` are already O(n)
— no concerns; the test suite should include one test asserting no accidental
O(n²) is introduced if the function grows more terms.

### REC-2 — Fold in real place metadata (distance/hours/budget) as hard constraints
**Current state:** `filterPlaces` already applies mode-based hard filters
(open-now for late-night, price cap for cheap-eats, rating/price floor for
luxury, gem-only for hidden-gems) — this is already the "rule-based constraints"
layer the brief asks for in principle. What's missing: a generic budget
constraint independent of mode (brief §6 lists "budget" as its own axis), and
using DAT-2's new `hoursToday` data for a stronger open/closed signal than the
current boolean.
**Problem:** Budget today only matters inside the "cheap eats"/"luxury" modes; a
visitor in "explore" mode with a learned low price affinity (MEM-2) gets no
budget-aware filtering at all.
**Proposed solution:** Add a standalone, additive (not hard-filter, to avoid
ever "leaving the visitor with a dead city" — preserving the existing
`if (out.length === 0) out = places` safety net) budget-affinity scoring term
inside `filterPlaces`'s existing sort step, independent of `mode`.
**Files affected:** `lib/recommend.ts`.
**Dependencies:** REC-1, MEM-2, DAT-2.
**Acceptance crieria:** existing mode-based filter test cases from REC-1 remain
unchanged (regression-safe); a new test shows budget affinity re-sorts
same-mode results.
**Tests:** extends `lib/recommend.test.ts`.
**Security considerations:** none. **Performance considerations:** none (still
O(n log n) for the sort).

### REC-3 — Recommendation pipeline as a single testable entry point
**Current state:** The pipeline today is implicitly assembled inline in
`app/page.tsx` (fetch places → `rankCategories` → `filterPlaces` →
render) — correct, but not independently callable/testable outside a mounted
React component.
**Problem:** Brief §6 asks for a "testable pipeline" as a first-class property.
**Proposed solution:** Extract a pure `buildRecommendations(ctx)` function in
`lib/recommend.ts` that takes the full typed context (env, mind state, raw
places) and returns `{ rankedCategories, visiblePlaces }` — exactly what
`app/page.tsx`'s `useMemo` calls do today, just named and exported as one unit
so it can be imported directly in tests and, later, by AIC's context builder
without duplicating logic.
**Files affected:** `lib/recommend.ts`, `app/page.tsx` (call the new function
instead of two separate `useMemo`s — behavior-preserving refactor).
**Dependencies:** REC-1, REC-2.
**Acceptance criteria:** `app/page.tsx`'s rendered output is byte-identical
before/after this refactor for a fixed set of inputs (manual regression check).
**Tests:** `lib/recommend.test.ts` gains an end-to-end-of-the-pure-function test.
**Security considerations:** none. **Performance considerations:** none (pure
refactor).

---

## PHASE 6 — AI Concierge
*(brief section 5 — the first genuinely new subsystem; depends on REC-3 and MEM for context, SUP-6 for caching)*

**STATUS (2026-10-08): AI ARCHITECTURE IMPLEMENTED — AI SERVICE NOT LIVE.**
Implemented ahead of REC-1..3/MEM-1..4/SUP-6 (none of which existed yet) by
building a self-contained version: `lib/ai/buildContext.ts` does the
deterministic candidate filtering directly from whatever places the caller
already fetched (not from a formalized `lib/recommend.ts` pipeline, which
doesn't exist yet — see Phase 5/REC below), and `lib/ai/cache.ts` is an
in-memory per-process cache (same pattern as `lib/rateLimit.ts`), not the
`ai_suggestions` Supabase table (SUP-6 — Supabase still has no application
code reading/writing any table besides the identity bootstrap from Phase 4).
Every AIC task below is done in spirit; swapping the in-memory cache for
`ai_suggestions` once Supabase is live is a drop-in change confined to
`lib/ai/cache.ts`. **Critically: `ANTHROPIC_API_KEY` has never been set in
this environment, and `lib/ai/anthropic.ts` has never executed against the
real Anthropic API** — every test in `lib/ai/*.test.ts` and
`app/api/concierge/route.test.ts` mocks `requestConciergeCompletion` directly.
The code is real; its behavior against a real model is unverified. See
`PROJECT_STATUS.md`'s Phase 5 update for the full distinction.

### AIC-1 — Context builder (structured, redacted, bounded)
**Current state:** `Concierge.tsx` and `lib/itinerary.ts` are entirely
deterministic today (confirmed: no `@anthropic-ai/sdk` dependency, no API calls
to any LLM anywhere in the repo) — the "AI City Concierge" name is currently
aspirational branding over template logic. `ARCHITECTURE.md` §5 describes the
intended "LLM layer" but it was never built.
**Problem:** Before any LLM call can be made safely, there must be a single
function that assembles *only* the structured context the brief specifies
(location, weather, time, season, preferences, recent interactions, available
places + metadata, distance, hours, budget, mood, requested energy) and
explicitly excludes anything else (no raw IP, no precise GPS beyond what's
needed, no other visitors' data).
**Proposed solution:** `lib/ai/buildContext.ts` — a pure function taking the same
shape of inputs as `buildRecommendations` (REC-3) plus the Concierge's chosen
`Energy`, and returning a strictly-typed `ConciergeContext` object (documented
interface, every field justified by a brief bullet point). This is the
"structured context rather than raw user information" the brief requires.
**Files affected:** new `lib/ai/buildContext.ts`, new `lib/ai/types.ts`.
**Dependencies:** REC-3, MEM-1/2/3.
**Acceptance criteria:** `ConciergeContext` has no field that round-trips raw PII
(no IP string, no account identifiers — only a pseudonymous session concept if
needed later); a unit test enumerates every field and asserts it's one of an
explicit allow-list.
**Tests:** the allow-list test above; a test with a fixture environment/mind
state asserting correct context assembly.
**Security considerations:** this is the primary prompt-injection *surface*
reduction — by construction, the LLM never receives free-text the visitor typed
(there is no free-text input in the Concierge UI today — selections are from a
fixed `ENERGIES` enum), which drastically limits injection risk from the
visitor's side. The remaining injection surface is place *names/addresses* from
Google Places data (not user-authored, but third-party-authored and technically
attacker-influenceable by anyone who can edit a Google Business listing) —
addressed in AIC-5.
**Performance considerations:** context assembly must stay fast (<10ms, pure
object mapping) since it runs before every AI call.

### AIC-2 — Anthropic integration: constrained recommendation generation
**Current state:** No Anthropic SDK, no server route for it.
**Problem:** Brief §5 wants real AI-generated recommendations, but explicitly:
"do not allow the LLM to invent places" — deterministic code must own factual
constraints (availability, distance, hours, valid IDs).
**Proposed solution:** New edge/node route `app/api/concierge/route.ts`
(server-only, uses `env.server.ANTHROPIC_API_KEY`). It calls the Claude API with
**tool use / structured output**: the model is given the exact list of
candidate places (with their real IDs) already filtered by `buildRecommendations`
+ `filterPlaces`'s hard constraints, and is constrained to return a JSON
structure that *references place IDs from that list only* (e.g., an ordered
array of `{ placeId, whyThisOrder }` plus a short narrative), never free-form
place data. The deterministic `composeJourney`-style assembly (distances,
hours, actual coordinates) is still done in `lib/itinerary.ts`/`lib/recommend.ts`
— the LLM only re-orders/narrates *among* already-valid candidates.
**Files affected:** new `app/api/concierge/route.ts`, new
`lib/ai/anthropic.ts` (thin client wrapper), `package.json` (add
`@anthropic-ai/sdk`).
**Dependencies:** AIC-1, FND-2 (env), DAT-1 (timeout/rate-limit pattern reused).
**Acceptance criteria:** the route's response schema is validated with zod
server-side before being returned to the client; any `placeId` in the model's
response that isn't in the candidate set sent to it is dropped (never trusted),
logged as an anomaly, and the system falls back to the existing deterministic
`composeJourney` ordering for that request.
**Tests:** unit test feeding a mocked Anthropic response containing a
hallucinated/invalid place ID and asserting it's filtered out, not surfaced;
unit test for the zod schema rejecting malformed model output.
**Security considerations:** AIC-5 covers this route's specific
abuse/injection/rate-limit controls.
**Performance considerations:** this is a genuinely slower code path (LLM
round-trip, likely 1-3s) — must be presented behind the existing "loading" step
`Concierge.tsx` already has (`step === "loading"`), no UI change needed there;
must have a strict timeout (reuse DAT-1) with fallback to the deterministic
journey on timeout, never a hung UI.

### AIC-3 — Wire the Concierge UI to the new endpoint, deterministic-first
**Current state:** `Concierge.tsx`'s `generate()` function currently calls
`composeJourney` directly (client-side, instant, deterministic).
**Problem:** Needs to call the new AI route while preserving instant usability.
**Proposed solution:** `generate()` first computes the deterministic journey
(unchanged, instant — matches today's UX, zero added latency for the base
experience) and displays it immediately; it then optionally calls
`/api/concierge` in the background to fetch an AI-refined ordering/narrative and
swaps it in if it arrives within a short window (e.g. 2.5s) — "AI as an
enhancement layer, deterministic as the guaranteed baseline," matching the
brief's framing in §5/§6 precisely. If `/api/concierge` fails, is slow, or
`ANTHROPIC_API_KEY` is unset, the visitor never sees a difference from today.
**Files affected:** `components/concierge/Concierge.tsx`.
**Dependencies:** AIC-2.
**Acceptance criteria:** with no `ANTHROPIC_API_KEY` set, the Concierge behaves
byte-identical to today (regression test); with a (mocked, in tests) key set and
a successful response, the journey narrative/order can change but every
`place` shown is still drawn from the real candidate set fetched from
`/api/places`.
**Tests:** e2e test for both the no-key path (unchanged behavior) and a
mocked-AI-response path (narrative updates, places stay valid).
**Security considerations:** none beyond AIC-2.
**Performance considerations:** the "show deterministic immediately, upgrade
later" pattern means this task cannot regress perceived latency versus today.

### AIC-4 — `ai_suggestions` caching
**Current state:** Table exists and is designed for exactly this
(`context_hash`, `payload`, `expires_at` 6h default).
**Problem:** Without caching, every Concierge open for a common context (same
city/phase/season/weather/mode) re-spends an LLM call.
**Proposed solution:** `app/api/concierge/route.ts` computes a context fingerprint
hash (city + phase + season + weather-kind + energy — explicitly *not*
including the visitor's precise affinities, so the cache is shareable across
visitors in the same context, matching the schema's public-read design) and
checks `ai_suggestions` (via the anon client, public-read policy already
correct in the existing schema) before calling Anthropic; on a miss, it writes
the result back via the service-role client (server-only, inside the route
handler).
**Files affected:** `app/api/concierge/route.ts`, new `lib/ai/cache.ts`.
**Dependencies:** AIC-2, SUP-1 (needs the Supabase client wiring, not
visitor-specific auth since this table is public-read).
**Acceptance criteria:** two requests with an identical fingerprint within 6h
produce the same cached payload and skip the Anthropic call (verifiable via a
call-count assertion in tests with a mocked Anthropic client).
**Tests:** integration test against local Supabase: seed a cache row, assert the
route returns it without invoking the mocked LLM client; assert expiry is
respected.
**Security considerations:** the cache is public-read by design (per the
existing schema) — confirm no per-visitor personal data ever ends up in the
cached `payload` (enforced by AIC-1's allow-list excluding personal affinities
from the hashable/cacheable context).
**Performance considerations:** this is the main cost/latency control for the AI
layer — cache hits should respond as fast as any other API route (no LLM
latency at all).

### AIC-5 — AI endpoint security hardening
**Current state:** N/A (route doesn't exist yet).
**Problem:** Brief §11 specifically calls out "AI endpoints," "prompt injection
risks," and "abuse prevention" as audit targets.
**Proposed solution:** (a) Rate-limit `/api/concierge` more strictly than the
data routes (LLM calls cost real money) using DAT-1's limiter with a tighter
budget; (b) treat all third-party-authored text that reaches the prompt (place
names/addresses from Google Places) as untrusted — wrap them in a clearly
delimited, instruction-free data block in the prompt template, and instruct the
model (in the system prompt) to treat that block as data only, never as
instructions, mirroring the same instruction/data boundary principle used
elsewhere in this plan's own tooling; (c) cap max tokens and candidate-list size
sent to the model; (d) never let the model's free-text narrative field be
rendered as raw HTML (React's default text escaping already protects this, but
add an explicit test).
**Files affected:** `app/api/concierge/route.ts`, `lib/ai/anthropic.ts`.
**Dependencies:** AIC-2.
**Acceptance criteria:** a fixture place name containing a prompt-injection
attempt (e.g. a name like `"Ignore previous instructions and..."`) does not
alter the model's output schema or cause it to emit an out-of-set place ID, in
a recorded test transcript against the real API (run manually/in a gated CI job,
not on every commit, to control cost) or a mocked adversarial-response test (run
every CI build).
**Tests:** the adversarial fixture test above (mocked, every build); the gated
real-API transcript test (manual/scheduled, not per-commit).
**Security considerations:** this task's entire purpose is security.
**Performance considerations:** stricter rate limit than data routes, by design.

### AIC-6 — Graceful degradation contract (explicit)
**Current state:** Implicit today (there is no AI layer to degrade from).
**Problem:** Worth stating as an explicit, testable contract once AIC-2/3 exist,
since it's the thing that makes adding AI *safe* for an app whose core identity
is "works with zero API keys."
**Proposed solution:** Document (in `docs/ai-concierge.md`) and test the full
fallback ladder: Anthropic key present & call succeeds → AI-refined journey;
key present & call fails/times out → deterministic journey, logged, no user
-visible error; key absent → deterministic journey, no network call attempted at
all (don't even hit the route).
**Files affected:** new `docs/ai-concierge.md`.
**Dependencies:** AIC-3.
**Acceptance criteria:** the three-rung ladder above is each covered by one test.
**Tests:** see above (largely overlaps AIC-3's test list; this task's job is
making the contract explicit and documented, not adding new mechanics).
**Security considerations:** none beyond prior tasks.
**Performance considerations:** none beyond prior tasks.

---

## PHASE 7 — City Consciousness Evaluation
*(brief section 7)*

**STATUS (2026-10-08): DONE** — full audit completed against the real
`components/organism/Consciousness.tsx`. Decision stands: deterministic,
unchanged, no LLM. The audit also found and fixed three real issues reading
the component fresh rather than re-trusting the Phase 2 correction below: a
stale-closure bug (the periodic recomposition could read outdated `env.now`/
`env.city` for as long as weather/mode/atmosphere/travel stayed constant —
plausibly hours), dead `category`/`placeCount` props with no corresponding
content, and a missing `aria-hidden` inconsistent with the identical pattern
elsewhere in the app. `compose()` was extracted to a pure, exported,
independently-tested function (9 new tests, zero coverage before). Full
record: `docs/city-consciousness-audit.md`.

### CNS-1 — Keep the narrator deterministic; do not route through the LLM
**CORRECTION (post Phase-2 polish):** this section originally analyzed
`engine/consciousness.ts` as if it were the live narrator. It wasn't — a repo
-wide import check found zero references to it anywhere in the app; the file
has since been deleted as confirmed dead code (superseded, same as
`Awakening.tsx`). **The actual live narrator is
`components/organism/Consciousness.tsx`** — a parallel, already-translated
implementation (routes every line through `useT()`, keys like `nar.*`/
`atmo.*.whisper`) that nobody had wired the old engine file into. The
reasoning below still applies to the real component; only the filename
changes.
**Current state:** `components/organism/Consciousness.tsx` is a well-crafted,
weighted, seed-jittered candidate picker (local `compose()` function, ~90
lines) — priority-ladder candidate scoring, tone-aware phrase selection for
phase/weather/atmosphere/travel/returning-favorites, all keyed through
`t(...)` so it already speaks correctly in all 9 languages (verified via
`scripts/check-i18n.ts` — see the corrected I18-3 below).
**Problem/finding:** This system runs on every idle tick and behavioral change —
effectively continuous, low-latency, client-side narration. An LLM call at this
frequency would be (a) far too slow (seconds vs. the current sub-millisecond
template pick) for something meant to feel like an ambient, instant presence,
(b) costly at the call volume implied by "every idle tick," and (c) *not
actually better* — the existing phrase banks are specifically tuned, poetic, and
on-brand in a way generic LLM output would need significant prompt engineering
to match consistently.
**Proposed solution:** **Do not replace `compose()`/`greeting()` with an LLM.**
Keep City Consciousness 100% deterministic, exactly as the brief's own
instruction ("do not use an LLM where deterministic logic is superior")
anticipates. The *only* AI touchpoint worth adding is optional and rare: a
once-per-session, explicitly-triggered "reflect on my visit" long-form summary
(reusing the AIC pipeline's context builder from Phase 6, not a new AI
integration) — out of scope for this phase unless you want it added as a
discrete future task.
**Files affected:** none (no code change — this task is the audit + decision
record).
**Dependencies:** AIC-1 (to know what *would* be reused if the optional
long-form feature is ever requested).
**Acceptance criteria:** a short decision record exists (this section, or
promoted into `docs/ai-concierge.md`) so a future contributor doesn't
re-propose routing `compose()` through an LLM without re-deriving this reasoning.
**Tests:** none (no code change).
**Security considerations:** keeping this deterministic avoids an entire
additional prompt-injection surface (place/weather data already flows into
`compose()`'s candidate selection) for no UX benefit.
**Performance considerations:** this is explicitly the performance-preserving
choice — zero added latency, zero added network dependency for a
continuously-running feature.

---

## PHASE 8 — Realtime Presence
*(brief section 8 — privacy-first by explicit instruction)*

**IMPLEMENTED (code-complete, not live-verified)** — see
`docs/realtime-presence.md` for the full architecture, threat model, and
test record, and `PROJECT_STATUS.md`'s "Phase 9 (realtime)" update. RTP-1
through RTP-3 below were each implemented with real, documented deviations
from the original sketch — read `docs/realtime-presence.md`'s own
"Deviations from the original RTP-1/2/3 plan" section before treating any
"Proposed solution" text below as literally what shipped.

### RTP-1 — Privacy-preserving presence model (design)
**Current state:** `ARCHITECTURE.md` §7 describes this as "planned next phase;
schema already supports it" — but the *current* schema (`visitors` table) has no
presence-specific table, and more importantly has no privacy-preserving
*location bucketing* concept at all (it stores `last_lat`/`last_lon` as exact
doubles, which would be the wrong thing to broadcast to other visitors).
**Problem:** Brief §8 explicitly demands privacy-by-design: "without exposing
personal information or precise user locations."
**Proposed solution:** Never broadcast `visitors.last_lat/last_lon` directly.
Instead: (a) bucket each visitor's position into a coarse geohash cell (e.g.
geohash precision 5, ~4.9km × 4.9km — large enough to be meaningless as a
"where exactly is this person" signal, small enough to feel locally relevant);
(b) broadcast only `{ ephemeralId, geohashCell, category (optional, coarse),
timestamp }` over a Supabase Realtime channel scoped per city slug (reusing the
existing `city_moods.city` concept as the channel key); (c) `ephemeralId` is a
random UUID generated client-side per tab session (not `auth.uid()`, not
`client_seed`), so presence is unlinkable to any persisted identity even by the
app's own operators after the fact; (d) presence entries auto-expire (Supabase
Realtime Presence's built-in leave-on-disconnect, plus a short server-side TTL
as backup).
**Files affected:** new `docs/realtime-presence.md` (design doc, this task's
main output), new `lib/geohash.ts` (bucketing utility).
**Dependencies:** none technically, but sequenced after the AI/Supabase phases
since it's lower-priority than core personalization per the brief's own framing
("evaluate the planned... presence").
**Acceptance criteria:** the design doc is reviewed and confirms: no exact
coordinates ever leave the client in a presence broadcast; no persisted-identity
field (`auth.uid()`/`client_seed`) is ever broadcast; a visitor cannot
reconstruct another visitor's precise location from the broadcast data (worst
case: "someone is somewhere in this ~5km cell").
**Tests:** a unit test on `lib/geohash.ts` confirming precision-5 cells are
correctly sized and that no finer-grained data leaks through the bucketing
function.
**Security considerations:** this task is entirely a privacy/security design
task.
**Performance considerations:** Supabase Realtime Presence is purpose-built for
this (low overhead, server-managed); no custom polling needed.

### RTP-2 — Realtime channel implementation
**Current state:** No Supabase Realtime usage anywhere yet.
**Problem:** Implements RTP-1's design.
**Proposed solution:** `engine/usePresence.ts` hook: joins
`supabase.channel(`city:${citySlug}`)` presence channel on mount (only once
`awake` is true, matching the existing pattern of deferring non-critical
subsystems until after the planetary intro), tracks `{ ephemeralId,
geohashCell }`, and exposes the list of other present cells to render.
**Files affected:** new `engine/usePresence.ts`, `app/page.tsx` (mount
conditionally).
**Dependencies:** RTP-1, SUP-1 (Supabase client wiring, not auth — presence
uses the anon client with no identity requirement).
**Acceptance criteria:** two browser sessions in the same city slug see each
other's coarse cell within Supabase Realtime's normal propagation latency
(sub-second typically); closing a tab removes that presence entry promptly.
**Tests:** integration test with two simulated clients against local Supabase
Realtime.
**Security considerations:** channel name is a public city slug (not
sensitive); no auth required to join by design (matches "anonymous explorer"
framing), which also means no private data should ever be put on this channel —
re-asserted from RTP-1.
**Performance considerations:** presence updates are naturally low-frequency
(join/leave/heartbeat), not a continuous stream — negligible bandwidth.

### RTP-3 — Visual representation: anonymous sparks
**Current state:** `components/map/NeuralMap.tsx` already renders the visitor as
a nucleus with places as neurons around it — a natural visual slot exists for
"other explorers" per `README.md`'s own description ("other explorers appear as
faint anonymous sparks").
**Problem:** Needs a rendering approach that visually communicates "someone is
near" without implying precision the data doesn't have.
**Proposed solution:** Render each present geohash cell as a soft, low-opacity
drifting spark positioned at a *randomized offset within* the cell (not a
fixed point), explicitly reinforcing the fuzziness visually as well as
data-wise — never a precise dot. No name, no identifying glyph, no click
interaction beyond perhaps a generic "another explorer" label.
**Files affected:** `components/map/NeuralMap.tsx` (additive rendering layer).
**Dependencies:** RTP-2.
**Acceptance criteria:** visual review confirms sparks read as ambient/abstract,
not as precise pins; toggling the feature off (e.g. via reduced-motion or an
explicit opt-out) is possible, consistent with the app's existing
`prefers-reduced-motion` respect elsewhere.
**Tests:** component test asserting the render offset is randomized within
(not at the center of) the cell bounds.
**Security considerations:** none beyond RTP-1/2.
**Performance considerations:** cap the number of rendered sparks (e.g. top 20
nearest cells) to avoid unbounded render cost in a dense city.

---

## PHASE 9 — Multilingual System Audit
*(brief section 9 — mostly independent, can run in parallel with Phases 3-8)*

### I18-1 — Automated translation completeness checker
**Current state:** `lib/i18n.ts` (863 lines) implements 9 languages (not 8 — the
docs undercount, see CORE-2) with an explicit "missing keys fall back to
English" design — which is good resilience but means a missing translation is
currently *silent* (no build-time or runtime signal that, say, Greek is missing
12 keys that German has).
**Problem:** Brief §9 explicitly asks to check for "missing translations" and
"inconsistent translations" — there's currently no tooling to find them other
than manual reading of an 863-line file.
**Proposed solution:** A small script (`scripts/check-i18n.ts`, run in CI and
locally via `npm run i18n:check`) that parses `lib/i18n.ts`'s dictionaries,
diffs every non-English language's key set against `en`'s, and fails/warns on
any gap. Also flag keys where a non-English value is byte-identical to the
English value for strings longer than a few characters (a common sign of an
untranslated copy-paste rather than an intentionally-identical short token).
**Files affected:** new `scripts/check-i18n.ts`, `package.json` (new script),
CI config.
**Dependencies:** FND-1 (test harness conventions), FND-2 (CI wiring context).
**Acceptance criteria:** running the script today against the real file
produces a concrete, accurate report (first real output is itself useful
signal); CI fails on any newly-introduced gap going forward (existing gaps, if
any are found, get a tracked follow-up rather than blocking this task).
**Tests:** unit test for the diff logic using small fixture dictionaries.
**Security considerations:** none.
**Performance considerations:** none (build-time tool only).

### I18-2 — RTL behavior audit — DONE (Phase 8 + Phase 9)
**Resolved.** `lib/i18n.ts` correctly identifies Arabic as the only RTL
language (`dirOf`), and `app/page.tsx` sets `document.documentElement.dir`
reactively. The physical-vs-logical CSS question below was real: Phase 8
found and fixed 5 leaks (`text-left`/`text-right`/`ml-*`/`mr-*` → logical
`text-start`/`text-end`/`ms-*`/`me-*`) across Concierge, HudMenu,
AtmospherePicker, PlaceDetail, and Consciousness; Phase 9 re-audited and
confirmed no directional icons exist anywhere in the UI to mis-mirror (no
arrows or left/right-meaningful glyphs were ever added). The Playwright test
proposed below exists (`tests/e2e/rtl.spec.ts`) and passes. See
`docs/narrative-i18n-rtl-audit.md` and `docs/i18n-a11y-performance-audit.md`
for the full records.
**Current state (as originally written, kept for context):** `lib/i18n.ts`
correctly identifies Arabic as the only RTL language (`dirOf`), and
`app/page.tsx` sets `document.documentElement.dir` reactively. Not yet
verified: whether layout primitives across `components/` use logical CSS
properties (`margin-inline-start` etc.) vs. physical ones (`margin-left`)
that would visually break when mirrored, and whether directional icons (e.g.
arrows, the Concierge's "→" affordances if any) flip correctly.
**Problem:** RTL bugs are easy to introduce incrementally and only visible when
actually testing in Arabic — brief §9 explicitly asks for this check.
**Proposed solution:** A manual + automated pass: switch to Arabic in a running
instance, screenshot every major view (field, HUD dropdown, Concierge modal,
About panel, PlaceDetail), and fix any physical-property leaks found (targeted
CSS fixes only, not a redesign). Add one Playwright test that loads the app in
`dir=rtl` and asserts no element overflows its container (a cheap structural
proxy for "layout didn't break").
**Files affected:** likely small, targeted CSS/className fixes across
`components/**` wherever issues are found; new
`tests/e2e/rtl.spec.ts`.
**Dependencies:** FND-1.
**Acceptance criteria:** the audit screenshots are reviewed and any found
issues are fixed; the structural RTL test passes.
**Tests:** the Playwright spec above.
**Security considerations:** none. **Performance considerations:** none.

### I18-3 — Dynamic content translation coverage — RESOLVED, no gap found
**CORRECTION (post Phase-2 polish):** this section assumed the dead
`engine/consciousness.ts` was the live narrator and worried it was
English-only. It was never wired in. I18-1's checker (`scripts/i18n-report.ts`
+ `scripts/i18n-report.test.ts`) has since been built and run for real against
`lib/i18n.ts`'s actual `DICTIONARIES` export, covering every language and
every namespace including `nar.*` (the real narrator's keys, used by
`components/organism/Consciousness.tsx`), `journey.*`, and `atmo.*`.
**Verified result: zero missing keys in any of the 9 languages.** The
"suspect" (identical-to-English) matches the checker also reports are
legitimate — the brand name "echo earth" (correctly left untranslated
everywhere) and genuine cognates (Café, Restaurant, Chaos, Aurora, Social,
etc. are spelled identically or near-identically in French/German/Spanish).
**No translation work is required here.** This task is closed; see `ARCHITECTURE.md` §6–7 for the corrected, verified description of both the
concierge and the narrator, and `npm run i18n:check` to reproduce.

### I18-4 — Language persistence & SEO implications — PARTIALLY RE-EXAMINED (checkpoint + Phase 9)
**Update:** the "minimally, read Accept-Language server-side" half of this
item was actually implemented, verified correct, and then deliberately
reverted after measuring that it converts `/` from static to fully dynamic
rendering app-wide — see the checkpoint-verification note in
`PROJECT_STATUS.md` and `docs/i18n-a11y-performance-audit.md` §2 for the
full record. Phase 9 re-evaluated the explicitly-suggested static-compatible
alternatives (predictable default, client-side negotiation, explicit
persistence) and found all three already implemented and working, with no
demonstrated functional defect — so no code changed. The bigger
per-language-routing question below remains fully open, unchanged, still a
decision for you.
**Current state (as originally written):** Language auto-detection (IP country → navigator language →
English) plus manual override persisted via zustand (`lib/i18n.ts` uses
`persist` middleware per its imports). `app/layout.tsx` hardcodes
`<html lang="en">`, only corrected client-side after hydration in `app/page.tsx`
— meaning the *server-rendered* HTML always claims English regardless of the
eventual client language, and crawlers that don't execute JS see only English.
There are also no per-language routes/URLs at all (single root URL, per
`ARCHITECTURE.md`'s own "one canonical entry point" design) and no `hreflang`
tags.
**Problem:** Brief §9 explicitly asks about "language persistence" and "SEO
implications" together — this is exactly their intersection: a crawler-visible
mismatch between declared and actual language, and zero `hreflang` signaling for
a genuinely 9-language experience.
**Proposed solution:** This is a real architectural tradeoff to make explicitly,
not just patch: (a) minimally, read the visitor's `Accept-Language` header
server-side in `app/layout.tsx` to set a best-guess initial `lang` attribute
(cheap, no routing change, fixes the most glaring crawler mismatch); (b)
separately evaluate (not necessarily implement in this pass) whether
per-language routes (`/fr`, `/ar`, etc. via Next's i18n routing or manual
segments) are worth the real cost of restructuring from a single-URL SPA-like
app to route-based i18n — flagged as a **decision point for you**, since it's a
meaningfully bigger change than anything else in this phase and trades off
against the app's current "one living surface" design philosophy stated in
`ARCHITECTURE.md` §8.
**Files affected:** `app/layout.tsx` (server-side header read, small change);
`docs/i18n-seo-tradeoff.md` (new — lays out the routing decision for you).
**Dependencies:** none.
**Acceptance criteria:** the server-rendered `<html lang>` matches the
`Accept-Language`-derived guess before any client JS runs (verifiable via
`curl -H "Accept-Language: fr"`, same technique used in baseline verification);
the routing tradeoff doc exists for your decision.
**Tests:** a request test asserting the `lang` attribute changes with the
`Accept-Language` header.
**Security considerations:** none.
**Performance considerations:** none (one header read, no added latency).

---

## PHASE 10 — Performance Audit
*(brief section 10 — largely independent, can run in parallel with Phases 3-9)*

### PRF-1 — REQUIRES HUMAN ACTION (product decision): device-aware particle/visual tiering
**Current state:** `engine/environment.ts` still declares a full
`PerfTier = "survival" | "low" | "mid" | "high"` type and a `tierDensity` table
with real `low: 0.25` / `mid: 0.6` values, and `useEnvironment` still correctly
*computes* a real hardware signal (`perfTier`, from
`navigator.hardwareConcurrency`/`deviceMemory`) — but `resolveTheme` discards
it: `const tier: PerfTier = survival ? "survival" : "high";`. **This is not an
accidental regression** — the code has an explicit comment at that line
explaining it's intentional: "the interface renders identically on every
device... richness is NOT scaled by device performance tier," landed in commit
`d897d07` ("Render identically on all devices: drop performance-tier visual
scaling"). The component's own doc-comment in `ParticleField.tsx` ("density
scaled to your hardware") is the stale part — not the behavior.
**Problem:** Every non-Survival-Mode device gets full particle density (up to
2200 CPU-animated particles) regardless of actual hardware capability, which
cuts against brief §10's "degrade gracefully on weaker devices" — but reversing
a previously-made, documented visual-consistency decision is a product
tradeoff, not a bug fix. **I'm not making this call unilaterally** — it needs
your sign-off before implementation, per the "do not replace working
architecture merely because you personally prefer another approach" rule.
**Proposed solution:** Reinstate a *lightweight* tiering signal — not the old
static `navigator.hardwareConcurrency`/`deviceMemory` heuristic necessarily
(worth checking what was actually removed via `git show d897d07` before
rewriting), but ideally a runtime one: measure actual frame time for the first
few seconds after `ParticleField` mounts and step density down if frame budget
is being missed, which handles the real-world case the static heuristic
couldn't (device claims high-end specs but a browser tab is already under load).
If a static heuristic is simpler to reintroduce safely, that's an acceptable
first step — the point is restoring *some* adaptive floor below "high" for
devices that need it.
**Files affected:** `engine/environment.ts` (`tier` computation),
`components/organism/ParticleField.tsx` (consumes `density`, no change needed —
it already respects the `density` multiplier correctly).
**Dependencies:** FND-1 (to test the heuristic).
**Acceptance criteria:** throttling a test browser to a low-end CPU profile
(Chrome DevTools CPU throttling 6x) measurably reduces particle count via the
new tiering, instead of staying pinned at "high."
**Tests:** unit test for the frame-time-based (or heuristic-based) tier
function with mocked `requestAnimationFrame` timings; a manual DevTools
verification pass.
**Security considerations:** none.
**Performance considerations:** this task *is* the performance fix — the
highest-priority item in this phase given it's a confirmed regression, not a
hypothetical risk.

### PRF-2 — Bundle size / code-splitting audit
**Current state:** Production build output (from the baseline check) shows `/`
at 91.5 kB page weight / 194 kB first load JS (now 118 kB / 221 kB as of the
Phase 9 audit — growth is real and accounted for across phases, see
`PROJECT_STATUS.md`) — not alarming for a WebGL-heavy app. **Correction (Phase
9, `docs/i18n-a11y-performance-audit.md`):** this entry's speculation that
`gsap` was "used presumably in `PlanetaryEntry`/`LivingEarth`" was checked
directly and was wrong — `gsap` was never imported anywhere in the source,
confirmed by grepping the whole repo. It has been **removed** from
`package.json` (`npm uninstall gsap`, 6.4 MB off `node_modules`); there is
nothing left to code-split for it. `three`, `@react-three/fiber`, and
`@react-three/drei` remain, and `ParticleField` is already correctly
dynamically imported with `ssr: false` in `app/page.tsx` (good existing
practice). Not yet verified: whether `drei` is also scoped to a dynamic
import, or bundled into the initial chunk unconditionally.
**Problem:** Brief §10 asks to audit "client-side JavaScript" generally.
**Proposed solution:** Run `next build` with `ANALYZE=true` (via
`@next/bundle-analyzer`) and confirm every Three.js-touching component
(`PlanetaryEntry`, `LivingEarth`, `ParticleField`, `NeuralMap` if it uses
canvas-heavy deps) is dynamically imported with `ssr: false` the same way
`ParticleField` already correctly is; fix any that aren't (additive change,
same proven pattern, not a new approach).
**Files affected:** `package.json` (dev dep), `next.config.ts` (analyzer
wiring, dev-only), possibly `app/page.tsx` import statements.
**Dependencies:** none.
**Acceptance criteria:** bundle analyzer report reviewed; any component over
~20kB gzipped that isn't already code-split is fixed.
**Tests:** a CI budget check (e.g. `next build` output size assertion) guarding
against regression once a good baseline is established.
**Security considerations:** none.
**Performance considerations:** this task's entire purpose is performance.

### PRF-3 — Audio battery/CPU audit
**Current state:** Covered procedurally in CORE-4 (visibility-based
suspend/resume). Listed here to satisfy brief §10's explicit "audio" and
"battery usage" callouts as a cross-reference, not a duplicate task.
**Problem/Solution/Files/Dependencies/Acceptance/Tests/Security/Performance:**
see CORE-4.

### PRF-4 — API call waterfall reduction
**Current state:** `app/page.tsx` fires `/api/places` in a `useEffect` keyed on
`[env.lat, env.lon, category]` — correct and already reasonably efficient
(single category at a time, matching what's visually shown). The Concierge's
`generate()` function, however, fires one `/api/places` call **per unique
category** in the energy's step list concurrently via `Promise.all` — already
parallelized, which is good; not a waterfall. The main opportunity is DAT-2's
proposed grid-cell cache reducing redundant calls across nearby requests,
already covered there.
**Problem:** No real waterfall found on direct reading — this task is mostly a
confirmation, with one real finding: switching categories rapidly (tapping
through `CategoryOrbs`) fires a new fetch per tap with no debounce, so a fast
double-tap briefly double-fetches (the `alive` flag correctly prevents a stale
response from clobbering a newer one, but both requests still hit the network).
**Proposed solution:** Add a small debounce (~150-200ms) to the category-change
effect in `app/page.tsx` — a minimal, additive change, not a restructure.
**Files affected:** `app/page.tsx`.
**Dependencies:** none.
**Acceptance criteria:** rapid category taps (within the debounce window)
result in exactly one network request, not one per tap.
**Tests:** unit/integration test simulating rapid state changes and counting
fetch calls.
**Security considerations:** none.
**Performance considerations:** small but real reduction in redundant Places API
spend.

### PRF-5 — Mobile device-tier verification pass
**Current state:** Not independently verified on real low/mid-tier hardware in
this audit (verified only in a desktop Chromium automation context during
baseline checks).
**Problem:** Brief §10 asks for mobile performance specifically.
**Proposed solution:** Once PRF-1 (tiering) and PRF-2 (bundle audit) land, run a
manual verification pass on at least one real mid/low-tier Android device (or
Chrome DevTools device emulation + CPU/network throttling as a first-pass proxy)
checking: time-to-interactive, particle frame rate, and whether Survival Mode
(`batteryLevel < 0.15` or save-data) engages correctly — this path already
exists in `environment.ts` and should be verified, not rebuilt.
**Files affected:** none expected (verification task; fixes feed back into
PRF-1/PRF-2 if issues are found).
**Dependencies:** PRF-1, PRF-2.
**Acceptance criteria:** a documented pass/fail report per the metrics above;
any failure files a follow-up against PRF-1/PRF-2 rather than being silently
absorbed.
**Tests:** this is itself a manual test pass; the Survival Mode trigger
condition already has unit-testable logic (`survival` boolean in
`environment.ts`) worth covering in REC-1-style test additions.
**Security considerations:** none.
**Performance considerations:** this task's entire purpose is verifying
performance on the hardware that matters most for a "local discovery app you'd
use while walking around a city."

---

## PHASE 11 — Security Hardening
*(brief section 11 — most individual controls are embedded in the phase that creates their risk; this phase is the closing, cross-cutting audit)*

**Status (Phase 10 security audit, `SECURITY_AUDIT.md`):** SEC-1 (route
input validation) — already correct, re-confirmed, no shared `lib/validate.ts`
module was needed (zod schemas live appropriately per-route already).
SEC-2 (rate-limiting coverage) — closed for real: `scripts/rateLimitCoverage.test.ts`
(runs in CI via `npm run test`) asserts every `app/api/**/route.ts`
imports `lib/rateLimit.ts`, failing CI if a future route forgets it, per
this entry's own proposed solution. SEC-3 (RLS penetration
checklist/pgTAP) — **not done**: no pgTAP suite exists (needs a live
Postgres with the `pgtap` extension, blocked on the same Docker-daemon
gap every Supabase item in this plan has hit); a manual SQL-level policy
trace was done instead and is documented in `SECURITY_AUDIT.md`, explicitly
not claimed as live-verified. SEC-4 (secrets-in-bundle CI check) — closed
for real: `scripts/checkSecretsInBundle.ts` + a dedicated CI step
(`.github/workflows/ci.yml`) that builds with recognizable dummy secret
values and fails if any leak into `.next/static/`; the detection mechanism
itself was proven this phase with a deliberately-planted fixture file,
caught, then removed (matching this entry's own acceptance criteria).
SEC-5 (privacy review sign-off) — no standalone `docs/privacy-review.md`
was written; its intent is substantially covered across
`SECURITY_AUDIT.md`'s "Supabase and access control"/"AI security" sections
and `docs/realtime-presence.md`'s dedicated threat model, but not
consolidated into one sign-off document — flagged as still open if a
single document is specifically wanted.

### SEC-1 — API route input validation
**Current state:** All three existing routes validate `lat`/`lon` as parseable
floats and `category` against the known enum (confirmed by reading
`app/api/places/route.ts` and `app/api/weather/route.ts` directly — this is
already done correctly today). No validation exists yet for the new
`/api/concierge` route (Phase 6) or any Supabase-backed route.
**Problem:** Mostly a forward-looking control for new surface area, not a fix to
existing routes (which are already sound).
**Proposed solution:** A shared zod-based request validator pattern
(`lib/validate.ts`) applied consistently to every new route added in this plan
(`/api/concierge`, any future write endpoints), reusing the same bounds-checking
spirit already present in the existing routes.
**Files affected:** new `lib/validate.ts`, `app/api/concierge/route.ts`.
**Dependencies:** AIC-2 (this validates that route's input).
**Acceptance criteria:** malformed input to any route returns a clean `400`,
never a `500` or an unhandled exception.
**Tests:** unit tests per schema (valid/invalid fixtures).
**Security considerations:** this task's purpose is security.
**Performance considerations:** negligible.

### SEC-2 — Rate limiting coverage audit
**Current state:** Implemented in DAT-1 for `/api/geo`/`/api/weather`/
`/api/places`; in AIC-5 (tighter) for `/api/concierge`.
**Problem:** N/A — this entry is the closing audit confirming coverage is
complete and consistently applied, not a new control.
**Proposed solution:** A single checklist/test asserting every route under
`app/api/**` has rate limiting applied (grep-based CI check: every
`route.ts` must import `lib/rateLimit.ts`, or be explicitly allow-listed with a
written reason).
**Files affected:** CI config.
**Dependencies:** DAT-1, AIC-5.
**Acceptance criteria:** the checklist passes; any future route without rate
limiting fails CI unless explicitly allow-listed.
**Tests:** the CI check itself.
**Security considerations:** closing control for abuse prevention.
**Performance considerations:** none.

### SEC-3 — Supabase RLS penetration checklist
**Current state:** Fixed in SUP-2; this is the closing verification.
**Problem:** N/A — verification task.
**Proposed solution:** Run SUP-2's pgTAP suite as a required CI gate (not
optional) before any production Supabase credentials are ever used; add a
written checklist in `docs/security-checklist.md` covering: cross-visitor read,
cross-visitor write, service-role key never reachable client-side (SUP-8),
public-read tables (`ai_suggestions`/`city_moods`) confirmed to contain no
per-visitor personal data.
**Files affected:** new `docs/security-checklist.md`, CI config.
**Dependencies:** SUP-2, SUP-8.
**Acceptance criteria:** checklist fully checked before Phase 3 is considered
"done" in practice (not just "code written").
**Tests:** SUP-2's pgTAP suite, run as a CI gate.
**Security considerations:** this is the gate itself.
**Performance considerations:** none.

### SEC-4 — Secrets-in-bundle verification
**Current state:** Covered in FND-2/SUP-8; this entry is the final closing
check across *all* secrets (Anthropic key included, not just Supabase).
**Problem:** N/A — verification task.
**Proposed solution:** Extend SUP-8's CI check to also grep for the literal
`ANTHROPIC_API_KEY`/`OPENWEATHER_API_KEY`/`GOOGLE_MAPS_API_KEY` (non-`NEXT_PUBLIC`
one) env var *values* (not names — names appearing in client code reading
`process.env.NEXT_PUBLIC_*` is expected and fine) in the built client bundle.
**Files affected:** CI config (extends SUP-8's check).
**Dependencies:** FND-2, SUP-8.
**Acceptance criteria:** CI fails if any server-only secret value leaks into
`.next/static`.
**Tests:** the CI check itself, with a deliberately-broken fixture proving it
catches a real leak (then reverted), same pattern as SUP-8.
**Security considerations:** this is the control.
**Performance considerations:** none.

### SEC-5 — Privacy review sign-off
**Current state:** N/A — closing review task.
**Problem:** Several features added in this plan handle user data (Supabase
memory, realtime presence, AI context) — brief §11 lists "user data" and
"privacy" explicitly.
**Proposed solution:** A single written privacy review
(`docs/privacy-review.md`) walking through: what's collected (interactions,
affinities, saved places — all pseudonymous via `auth.uid()`, never real
identity), what's shared with third parties (place queries to Google, weather
queries to OpenWeather, context to Anthropic — none include precise identity),
what's user-deletable (MEM-4's "forget my preferences"), and what's broadcast to
other users (RTP's coarse, ephemeral-only presence data). This is a documentation
task, not new code, but should block calling Phase 3/5/8 "complete."
**Files affected:** new `docs/privacy-review.md`.
**Dependencies:** SUP-4, MEM-4, AIC-1, RTP-1.
**Acceptance criteria:** the document exists and every data flow in the app has
an entry.
**Tests:** none (documentation).
**Security considerations:** this is the control.
**Performance considerations:** none.

---

## PHASE 12 — Testing Architecture Consolidation
*(brief section 12 — the scaffold was front-loaded as FND-1; this phase is about coverage completeness and CI, not new mechanics)*

**Status (Phase 10 audit):** TST-1 — no standalone `docs/test-coverage-map.md`
was written; `SECURITY_AUDIT.md`'s "End-to-end quality assurance" section
maps each of the brief's critical-journey categories to the test file(s)
covering it, which substantively serves the same purpose, but isn't a
literal 1:1 checklist document. TST-2 — **done**, with one deliberate
scope reduction: `.github/workflows/ci.yml` runs install → lint → `tsc
--noEmit` → unit/integration tests → i18n check → build → a secrets-in
-bundle leak check (SEC-4) → the full Playwright e2e suite (4 specs, small
enough that "a subset" wasn't necessary to hit a reasonable time budget).
**Not included**: local-Supabase integration tests in CI — would need a
Postgres+Supabase CLI service container in the workflow, which wasn't
set up this pass (no live/local Supabase verification has been possible
in this sandbox at all — see `SECURITY_AUDIT.md`'s "Live verification
still required"). The workflow itself has not yet run on a real GitHub
Actions runner.

### TST-1 — Coverage completeness pass
**Current state:** By this point in the plan, unit tests exist per-task
(recommendation engine, i18n checker, AI context builder, geohash, rate
limiter, env validation, RLS). No consolidated coverage view exists yet.
**Problem:** Brief §12 lists specific categories (unit, API, recommendation, AI
pipeline, database, integration, critical e2e) — worth an explicit pass
confirming each category has *at least one* real test, not just scattered
coverage.
**Proposed solution:** A coverage checklist mapped 1:1 to the brief's categories,
cross-referencing which task in this document delivers each: unit → REC-1,
i18n-1, PRF-1; API → DAT-5, AIC-2; recommendation → REC-1/2/3; AI pipeline →
AIC-2/5; database → SUP-2 (pgTAP); integration → SUP-3/4/5; critical e2e →
CORE-5, DAT-5, AIC-3. Fill any gap found.
**Files affected:** new `docs/test-coverage-map.md`.
**Dependencies:** effectively all prior phases' test deliverables.
**Acceptance criteria:** every brief-listed test category maps to at least one
real, passing test in the repo.
**Tests:** this task's output is the map; no new test mechanics invented here.
**Security considerations:** none. **Performance considerations:** none.

### TST-2 — CI pipeline
**Current state:** No CI configuration exists in the repo at all (no
`.github/workflows/`).
**Problem:** None of the tests above matter in practice without automated
enforcement on every change.
**Proposed solution:** A GitHub Actions workflow running, in order: install →
lint → `tsc --noEmit` → unit tests (Vitest) → local-Supabase integration tests
→ build → critical Playwright e2e subset (not the full matrix, to keep CI fast,
per brief's "do not attempt to test every animation visually"). Gate merges to
`main` on this workflow passing.
**Files affected:** new `.github/workflows/ci.yml`.
**Dependencies:** FND-1, SUP-2 (local Supabase in CI), all prior test-producing
tasks.
**Acceptance criteria:** a deliberately-broken PR (failing test) is blocked from
merge; a clean PR passes end-to-end in a reasonable time budget (target: under
10 minutes).
**Tests:** the pipeline is the deliverable.
**Security considerations:** CI secrets (test-only API keys, never production
ones) managed via GitHub Actions secrets, never committed.
**Performance considerations:** keep the e2e subset small and parallelized to
hit the time budget.

---

## PHASE 13 — SEO / Social
*(brief section 13 — low risk, independent, can run in parallel with almost anything)*

**Status (Phase 10 security/QA/SEO audit, `SECURITY_AUDIT.md`):** SEO-1
(OG image) — **done**, exactly as proposed: `app/opengraph-image.tsx` via
`next/og`'s `ImageResponse`, dark-gradient + accent-glow palette matching
the real app (not invented colors), verified as an actual 200/image-png
1200×630 response from a running production build, not just source.
SEO-2 (Twitter card) — **done**, reuses the same generated image via
`app/twitter-image.tsx`. SEO-3 (structured data) — **done**, using exactly
this entry's own recommended `WebApplication` type (not generic `WebSite`)
with `applicationCategory: "TravelApplication"`, verified present in the
real generated HTML. SEO-4 (sitemap/robots for multilingual content) —
still correctly a no-op; I18-4 has not resolved toward route-based i18n
(see `PROJECT_STATUS.md`'s Phase 9 update), so there is nothing to extend.

### SEO-1 — OpenGraph image
**Current state:** `app/layout.tsx`'s `openGraph` metadata has `title`,
`description`, `url`, `siteName`, `type` — but **no `images` field at all**,
confirmed by direct reading. A shared link today would render with no preview
image on any platform.
**Problem:** Concrete, confirmed gap — the single clearest SEO/social finding in
this audit.
**Proposed solution:** Add a dynamic OG image via Next's built-in
`ImageResponse` (`app/opengraph-image.tsx`), rendering the ECHO EARTH wordmark
and tagline over a dark gradient matching the app's actual palette variables
(`--ee-bg-deep` etc. — reuse real brand values, don't invent new ones), rather
than a static screenshot that would go stale.
**Files affected:** new `app/opengraph-image.tsx`, new
`app/twitter-image.tsx` (can reuse the same generator).
**Dependencies:** none.
**Acceptance criteria:** fetching `/opengraph-image` returns a valid image;
pasting the site URL into Slack/Twitter/iMessage (manual check) shows a
populated preview card.
**Tests:** a request test asserting `/opengraph-image` returns `200` with an
image content-type.
**Security considerations:** none. **Performance considerations:** Next
generates this at build/edge time, not per-request from scratch each time if
static inputs are used — keep the generator's inputs static (no per-visitor
personalization in the shared OG image).

### SEO-2 — Twitter/X card metadata
**Current state:** `app/layout.tsx`'s `metadata` object has no `twitter` field
at all (only `openGraph`), confirmed by direct reading.
**Problem:** Without explicit `twitter` metadata, X falls back to OpenGraph
tags, which mostly works but misses the `summary_large_image` card type
specifically and doesn't set a dedicated Twitter description if you ever want
one to differ.
**Proposed solution:** Add an explicit `twitter: { card: "summary_large_image",
title, description, images }` block to `metadata` in `app/layout.tsx`, reusing
SEO-1's image.
**Files affected:** `app/layout.tsx`.
**Dependencies:** SEO-1.
**Acceptance criteria:** Twitter's card validator (or equivalent manual check)
shows a large-image card.
**Tests:** a snapshot test of the generated `<meta>` tags via a Next metadata
test utility, or a simple request + HTML-parse assertion.
**Security considerations:** none. **Performance considerations:** none.

### SEO-3 — Structured data (JSON-LD)
**Current state:** None present anywhere in `app/`.
**Problem:** Brief §13 asks to evaluate this "where appropriate" — correctly
hedged, since ECHO EARTH isn't a conventional content site with articles/
products to mark up.
**Proposed solution:** The one clearly appropriate schema is `WebApplication`
(or `SoftwareApplication`) on the root layout — accurately describes what the
site *is* to a crawler, with `name`, `description`, `applicationCategory:
"TravelApplication"`, and `url`. Explicitly **not** recommending
`LocalBusiness`/`Place` schema for the synthesized or live place data — that
data isn't the app's own content, is often demo-synthesized, and marking it up
as structured local-business data would be both inaccurate for demo mode and
redundant with Google's own Places data (which already has its own structured
presence).
**Files affected:** `app/layout.tsx` (inline `<script type="application/
ld+json">` or Next's metadata API equivalent).
**Dependencies:** none.
**Acceptance criteria:** Google's Rich Results Test (manual check) parses the
schema without errors.
**Tests:** a request + JSON-parse assertion that the script tag contains valid
JSON-LD.
**Security considerations:** none (no dynamic/user-influenced content in this
block — static site-level facts only).
**Performance considerations:** negligible (small inline script).

### SEO-4 — Sitemap/robots refinement for multilingual content
**Current state:** `app/sitemap.ts` and `app/robots.ts` are both correct and
minimal for a single-URL, single-language-declared site (verified working in
baseline checks) — genuinely fine as-is *if* I18-4's routing question resolves
toward "no per-language URLs."
**Problem:** Conditional — only a real gap if I18-4 decides to add per-language
routes, in which case `hreflang` alternates would need adding to the sitemap.
**Proposed solution:** No change unless I18-4 resolves toward route-based i18n;
if it does, extend `sitemap.ts` with `alternates.languages` entries per Next's
supported sitemap i18n format.
**Files affected:** `app/sitemap.ts` (conditional on I18-4's outcome).
**Dependencies:** I18-4.
**Acceptance criteria:** N/A unless I18-4 triggers this; otherwise this task is
explicitly a no-op, documented as such so it isn't silently forgotten.
**Tests:** N/A unless triggered. **Security/Performance considerations:** none.

---

## PHASE 14 — Production Readiness
*(brief section 14 — naturally last, depends on the rest existing to have something to deploy/monitor/migrate)*

### PRD-1 — Environment management across deploy targets
**Current state:** Single `.env.example`; no documented separation between
local/preview/production values (e.g. a preview deploy using a separate,
disposable Supabase project vs. production's).
**Proposed solution:** Document (in `docs/deployment.md`) the required Vercel
environment variable scoping (Development/Preview/Production), each pointing at
its own Supabase project (so preview-deploy testing can never touch production
data) and its own rate-limit budget.
**Files affected:** new `docs/deployment.md`.
**Dependencies:** FND-2, FND-4.
**Acceptance criteria:** the doc exists and a preview deploy demonstrably uses a
separate Supabase project.
**Tests:** none (process/docs). **Security considerations:** prevents a preview
deploy from leaking into or corrupting production data. **Performance:** none.

### PRD-2 — Logging & monitoring in production
**Current state:** FND-3 establishes structured stdout logging; no aggregation/
alerting layer chosen yet.
**Proposed solution:** Wire Vercel's native log drain (or a lightweight
third-party like Sentry for error tracking specifically, re-using the error
boundaries from FND-3) with alerting on: API error-branch rate exceeding a
threshold (signals an upstream outage), AI endpoint failure rate, rate-limit
rejection spikes (signals abuse).
**Files affected:** `lib/log.ts` (sink configuration), new monitoring/alerting
config (platform-specific, not a repo file).
**Dependencies:** FND-3.
**Acceptance criteria:** a forced API failure in a staging deploy produces a
visible alert within the chosen tool.
**Tests:** none beyond FND-3's existing logger tests. **Security
considerations:** ensure alert payloads don't leak the same PII the logger
already redacts. **Performance:** fire-and-forget logging only.

### PRD-3 — Database migration workflow
**Current state:** Established in FND-4 (`supabase/migrations/`); this task is
the operational discipline around it.
**Proposed solution:** Document the required flow: every schema change is a new
numbered migration file, applied via `supabase migration up` in CI against a
disposable database before merge, and applied to production via the same CLI
during deploy — never a hand-run SQL console edit against production.
**Files affected:** `docs/deployment.md` (same doc as PRD-1, migrations
section).
**Dependencies:** FND-4, SUP-2.
**Acceptance criteria:** the documented flow is followed for every SUP-* task's
migration in practice (process discipline, not a one-time artifact).
**Tests:** CI's migration-apply step (already covered in FND-4's acceptance
criteria) is the enforcement mechanism.
**Security considerations:** prevents schema drift between environments, which
is itself a security-relevant consistency guarantee (e.g. RLS policies
matching production exactly). **Performance:** none.

### PRD-4 — Deployment pipeline
**Current state:** No CI/CD config exists yet (see TST-2).
**Proposed solution:** Extend TST-2's CI workflow with a deploy stage: on merge
to `main`, Vercel's existing Git integration (assumed, given `echoearthh.com` is
already live per `README.md`) handles the actual deploy; this task's job is
ensuring the *pre-deploy* CI gate (lint/typecheck/test/build/migration-check)
is required and blocking, not advisory.
**Files affected:** `.github/workflows/ci.yml` (branch protection
configuration is a repo-settings change, not a file).
**Dependencies:** TST-2.
**Acceptance criteria:** a failing CI run genuinely blocks the merge (verified
via GitHub branch protection settings, not just workflow existence).
**Tests:** N/A (process control). **Security/Performance considerations:**
none beyond prior tasks.

### PRD-5 — Rollback plan & feature flags for risky additions
**Current state:** No feature-flag mechanism exists; all-or-nothing deploys
today.
**Problem:** The two riskiest additions in this whole plan are AIC (external
LLM dependency, cost exposure) and RTP (new realtime infra, privacy-sensitive) —
both should be independently disable-able in production without a code
rollback if something goes wrong post-launch.
**Proposed solution:** A simple environment-variable-gated flag approach (no
need for a full feature-flag SaaS at this scale): `ENABLE_AI_CONCIERGE` and
`ENABLE_REALTIME_PRESENCE` server-side flags (validated via FND-2's env schema)
that, when false, make AIC-3's "AI enhancement" step and RTP-2's presence hook
simply never activate — both features are *already designed* (per AIC-3's
"deterministic-first" contract and RTP's additive rendering) to degrade to
"feature absent" cleanly, so this is a thin on/off switch over already-safe
fallback paths, not new resilience engineering.
**Files affected:** `lib/env.server.ts` (new flags), `app/page.tsx` (gate
RTP-2's hook), `components/concierge/Concierge.tsx` (gate AIC-3's AI call).
**Dependencies:** FND-2, AIC-6, RTP-2.
**Acceptance criteria:** flipping either flag to `false` in an environment
disables that subsystem with zero other behavior change, verified by the same
tests already written for the "AI/presence absent" paths in AIC-3/AIC-6.
**Tests:** reuses AIC-3's and RTP's existing "feature absent" test paths,
parameterized by the flag.
**Security considerations:** an instant kill-switch for the two subsystems with
the largest external-dependency and privacy surface is itself a security
control. **Performance considerations:** none beyond what those features
already cost when enabled.

---

## Recommended execution order

Numbered as a single sequence, collapsing the phases above. Items on the same
line can run **in parallel** (no dependency between them); items are otherwise
strictly ordered.

1. **FND-1, FND-2** (testing harness + env validation) — nothing else is safely
   verifiable without these.
2. **FND-3, FND-4** (logging/error boundaries + Supabase client wiring) — in
   parallel with each other.
3. **CORE-1 … CORE-5** (dead-code removal, docs refresh, HUD a11y fix, audio
   lifecycle, responsive regression tests) — in parallel with step 4; all
   independent, low-risk, and worth doing early for a cleaner base.
4. **DAT-1** (shared fetch/timeout/rate-limit utility) — blocks DAT-2/3 and
   AIC-2.
5. **DAT-2, DAT-3, DAT-4** (Places/Weather/Geo hardening) — in parallel with
   each other, and with step 6.
6. **SUP-1 → SUP-2** (anonymous identity, then the RLS fix — strictly
   sequential, SUP-2 depends on SUP-1).
7. **DAT-5** (demo-mode regression test) — anytime after step 5, cheap to slot
   in.
8. **SUP-3, SUP-4, SUP-5** (preference sync, telemetry, saved places) — in
   parallel with each other once SUP-2 lands; also in parallel with Phase 9
   (I18) and Phase 10 (PRF) and Phase 13 (SEO), none of which depend on
   Supabase.
9. **SUP-7, SUP-8** (city-moods aggregation, service-role isolation audit) — in
   parallel with step 8's tail end.
10. **MEM-1** (session/long-term split) — before finishing SUP-3's rollout, per
    MEM-1's own dependency note.
11. **MEM-2, MEM-3** — in parallel with each other, after MEM-1.
12. **REC-1 → REC-2 → REC-3** (ranking doc/tests, budget constraint, pure
    pipeline function) — strictly sequential; REC-3 is a hard prerequisite for
    AIC-1.
13. **MEM-4** (preference center UI) — after SUP-3/SUP-4 and MEM-1/2.
14. **AIC-1 → AIC-2 → AIC-3** (context builder, Anthropic route, UI wiring) —
    strictly sequential.
15. **AIC-4, AIC-5** — in parallel with each other, after AIC-2.
16. **AIC-6** — after AIC-3 (documents the already-built contract).
17. **CNS-1** — after AIC-1 exists (audit/decision task, no code); can slot in
    anywhere after step 14 begins.
18. **I18-1** — independent; can actually start as early as step 3 if you want
    to parallelize harder. Placed here for narrative flow.
19. **I18-2, I18-3** — after I18-1 (I18-3 specifically needs I18-1's gap
    report first).
20. **I18-4** — independent; produces a decision doc for you, doesn't block
    anything else.
21. **PRF-1** — independent (confirmed regression; fix as early as convenient —
    could reasonably move up to immediately after step 3 given it's the most
    concrete finding in the whole audit).
22. **PRF-2, PRF-4** — independent, in parallel with each other and with step
    21.
23. **PRF-5** — after PRF-1 and PRF-2.
24. **RTP-1 → RTP-2 → RTP-3** — strictly sequential; lowest priority of the
    major new subsystems per the brief's own framing ("evaluate the planned"),
    reasonably deferred until after AIC is stable.
25. **SEC-1 … SEC-5** — SEC-1/2 land incrementally alongside the routes that
    create their need (DAT-1, AIC-2/5); SEC-3/4 are closing audits run once
    SUP-2/SUP-8 exist; SEC-5 is a final sign-off once SUP/MEM/AIC/RTP all
    exist.
26. **SEO-1 → SEO-2**, **SEO-3** — independent of everything; can genuinely run
    anytime after Phase 0 (listed late only to match the brief's own ordering;
    feel free to pull forward if you want a quick, low-risk, high-visibility
    win early).
27. **SEO-4** — only if I18-4 resolves toward per-language routing.
28. **TST-1 → TST-2** — TST-1 is a coverage audit once most test-producing
    tasks above exist; TST-2 (CI) should actually be stood up as early as
    step 1-2 in a minimal form and *grown* throughout, not literally built last
    — the ordering here reflects "fully comprehensive CI" maturity, not "CI
    doesn't exist until now."
29. **PRD-1 … PRD-5** — last, by nature (nothing to deploy/monitor/roll back
    until the rest exists), though PRD-1's environment-separation doc is worth
    writing as early as FND-4 so Supabase projects are provisioned correctly
    from the start rather than retrofitted.

**Practical note on parallelization:** if you have more than one contributor (or
want to batch AI-assisted implementation sessions), the three largest
independent tracks that can run fully in parallel against the Phase 0/2
foundation are: **(a)** Supabase + Memory + Recommendation + AI Concierge
(Phases 3-6, strictly ordered internally), **(b)** Multilingual audit (Phase
9), and **(c)** Performance audit (Phase 10) + SEO (Phase 13). Realtime
Presence (Phase 8) and the full Security/Testing/Production closing phases
(11-14) are best done last since they either depend on or audit everything
else.
