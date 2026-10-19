# ECHO EARTH — Security, QA, and SEO hardening audit (Phase 10)

Date: 2026-10-19. Full cross-system review per the brief; re-read every API
route, the Supabase migrations/identity code, the AI pipeline, the
recommendation/environment/narrator engines, the translation system, and
the realtime presence implementation fresh, rather than trusting prior
phases' own summaries of them. This document reports what was actually
found and actually fixed — **passing tests are not, by themselves, a claim
that the application is secure**; see "Outstanding risks" and "Live
verification still required" below for what this audit could not confirm.

## How to read this document

Findings are ranked by severity. For each: what it is, the affected
component(s), the fix applied (or why it wasn't), and the test evidence.
No secret values appear anywhere in this document or in the commit this
phase produced.

---

## Findings

### CRITICAL — fixed

**1. `next` itself carried multiple critical, unauthenticated-RCE-class
CVEs; previously miscategorized as "dev-tooling only."**
Earlier phases' `npm audit` reviews (see `PROJECT_STATUS.md`'s baseline)
characterized every advisory as "transitive build-tool dependencies... not
exploitable app-facing issues." Re-running `npm audit` this phase surfaced
that `next` **itself** (not a transitive dev dependency — the production
framework this app actually runs) was flagged CRITICAL, with named
advisories including:
- GHSA-p293-qw3h-jr36 — *Next.js: Unauthenticated Remote Code Execution on
  Windows-hosted servers* (CVSS 9.0)
- GHSA-2xp9-vwfh-vxw4 — *Next.js: Unauthenticated Remote Code Execution in
  Image Optimization API when AVIF files are used*
- GHSA-p9j2-gv94-2wf4 — *Next.js: Server-Side Request Forgery in rewrites
  via attacker-controlled destination hostname*
- Several further DoS and cache-poisoning advisories (full list was in the
  raw `npm audit` output, not reproduced here to keep this report short —
  reproducible via `npm audit` on the pre-fix lockfile in git history).

All fixed in Next.js versions up to 15.5.27/15.5.28, all within the
project's existing `"next": "^15.5.19"` semver range (no breaking major
version change).

**Affected component**: the entire application (every route, every page —
`next` is the framework).
**Fix applied**: `npm audit fix` (non-destructive; no `--force`), which
resolved `next` to **15.5.28**. `next`'s own audit severity dropped from
CRITICAL to MODERATE (the residual moderate finding is `next`'s own
*nested, vendored* `postcss` copy, which would need a Next v16 major bump
to clear — see "Outstanding risks").
**Test evidence**: full re-verification after the bump — lint 0
errors/warnings, `tsc --noEmit` clean, **34 files / 181 tests passing**,
production build clean (`/` still static, First Load JS unchanged at
119 kB/222 kB), and all 8 Playwright e2e tests (5 spec files) passing against the
upgraded framework.

---

### HIGH — fixed

**2. `/api/concierge` had no request-body size limit before parsing.**
A POST body is read via `req.json()` with no size check beforehand —
an oversized body would be fully parsed (consuming memory/CPU) before
`ConciergeRequestSchema` ever gets a chance to reject it for being
malformed. Vercel's platform imposes its own body-size cap upstream, but
this app has no such guarantee self-hosted, and even on Vercel this is a
real app-level gap.
**Affected component**: `app/api/concierge/route.ts`.
**Fix applied**: a `Content-Length`-based guard (64 KB bound — generous
headroom over any schema-valid payload, since `ConciergeRequestSchema`
already caps candidates at 60 items with per-field length limits) returns
`413` before `req.json()` runs, when the header is present and exceeds the
bound. (A missing/unparseable header doesn't trigger a false-positive
rejection — see the code comment for why.)
**Test evidence**: new test, `app/api/concierge/route.test.ts` — "rejects
an oversized body (by its declared Content-Length) with 413, before ever
parsing it," asserting the AI boundary is never reached. Passing.

**3. `/api/geo` trusted edge-proxy headers without validating they're real
coordinates.**
`x-vercel-ip-latitude`/`x-vercel-ip-longitude` (and the Cloudflare
equivalents `cf-iplatitude`/`cf-iplongitude`) were `parseFloat()`'d and
returned as a "live" `source: "edge-header"` result with **no bounds or
NaN check** — unlike `/api/weather` and `/api/places`, which both already
validate their own `lat`/`lon` query params as finite numbers in
[-90,90]/[-180,180]. If this app is ever deployed somewhere that doesn't
actually strip/overwrite Cloudflare-specific headers (e.g., Vercel without
Cloudflare in front of it), a client could send a spoofed `cf-iplatitude`
header directly and have it parsed as `NaN` or an out-of-range value,
silently accepted as "live."
**Affected component**: `app/api/geo/route.ts`.
**Fix applied**: the same finite + in-range validation `/api/weather`
and `/api/places` already use. An invalid/malformed header value now
falls through to the next geolocation strategy (IP lookup, then the
hardcoded fallback) instead of being trusted.
**Test evidence**: new test — "ignores malformed/out-of-range edge-header
coordinates instead of trusting them as a live source." Passing, alongside
the route's 4 pre-existing tests (edge-header happy path, IP-lookup
success/failure, rate limiting).

**4. No baseline security response headers anywhere.**
Neither `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, nor
a `Permissions-Policy` were set on any response — page or API route.
**Affected component**: `next.config.ts` (applies site-wide).
**Fix applied**: `headers()` now sets `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a `Permissions-Policy` that blocks camera/microphone/payment/usb and
explicitly keeps `geolocation=(self)` allowed (the app's own GPS-upgrade
path in `engine/useEnvironment.ts` needs it — breaking that to tighten a
policy would be exactly the kind of tradeoff the brief warns against).
**Not added**: a Content-Security-Policy — this app dynamically loads the
Google Maps JS SDK's own script (`components/map/LivingMap.tsx`) plus
Next's inline hydration scripts; a correct CSP needs real browser testing
against every one of those paths before it ships, not a blind guess.
Flagged as a recommended follow-up.
**Test evidence**: verified against the actual running production build
(`npm run start`, then `curl -sI`) on both `/` and `/api/geo` — all four
headers present on real responses. Also re-ran the full Playwright suite
against `next dev` with the headers active — all 8 tests still pass.

**5. Google Place ID interpolated into a Maps URL without encoding.**
`components/discovery/PlaceDetail.tsx`'s "Open in Maps" link built
`query_place_id=${place.id}` directly, unlike the adjacent `query=` param
on the same line, which already correctly used `encodeURIComponent`.
Google's real place-ID format is URL-safe in practice, so this was
low-exploitability, but it's a real, cheap-to-fix inconsistency —
defense-in-depth against a third-party API ever changing that format.
**Fix applied**: wrapped in `encodeURIComponent`, matching the sibling
field.

---

### MEDIUM/LOW — fixed (SEO, QA, CI — not vulnerabilities, but real gaps)

**6. No Twitter/X card metadata, no social preview image at all.**
`app/layout.tsx`'s `metadata.openGraph` had no `images`, and there was no
`twitter` block whatsoever — confirmed by reading the actual rendered
`<head>` of a production build (`curl` against `next start`), not just the
source.
**Fix applied**: added `metadata.twitter` (`summary_large_image`, reusing
the exact same name/tagline text already in `openGraph` — no new claims).
Generated an actual, project-owned, on-brand 1200×630 social preview image
via Next's `next/og` file convention (`app/opengraph-image.tsx`,
`app/twitter-image.tsx`), rendered in the organism's own palette (same
deep background + accent glow as `LanguageGate.tsx`'s intro screen), using
only facts already stated in the metadata — no fabricated ratings,
addresses, or other business data.
**Verified in the generated application**: built the app, started the real
production server, and `curl`'d both the HTML (`og:image`/`twitter:image`
tags present, pointing at real URLs) and the image endpoints themselves —
`200`, `image/png`, confirmed `1200x630` PNG via file-signature inspection.
**A second bug caught by writing the automated test, not by the manual
curl check above**: `twitter-image.tsx` initially just re-exported
`opengraph-image.tsx`'s `size`/`contentType`/`default` — worked fine under
`next build`/`next start`, but running the new Playwright SEO spec
(`tests/e2e/seo-metadata.spec.ts`) against `next dev` surfaced a real
webpack warning (`export 'size' ... was not found`) from Next's
metadata-route loader, which needs those as literal exports in the same
file to reliably analyze under dev mode. Fixed by duplicating the small
component instead of re-exporting it — a deliberate, documented tradeoff
(see the file's own comment), not an oversight.

**7. No canonical URL, no structured data.**
**Fix applied**: `alternates.canonical: "/"` added (verified present as
`<link rel="canonical">` in the real generated HTML). A minimal
`WebApplication` JSON-LD block added to `app/layout.tsx` (matching
`IMPLEMENTATION_PLAN.md`'s own `SEO-3` recommendation of `WebApplication`
over generic `WebSite`, since this is an interactive app, not a content
site) — name/url/description already stated verbatim elsewhere in the same
file's `metadata`, plus an honest categorical `applicationCategory:
"TravelApplication"`; no invented ratings, reviews, or addresses, per the
brief's explicit instruction. This is the **only** `dangerouslySetInnerHTML`
anywhere in
the codebase (confirmed via a full-repo grep both before and after this
change) — used here only because JSON-LD has no other way to reach
`<head>`, with zero interpolated or user-derived content (fully static,
developer-authored JSON), which is the standard, low-risk, sanctioned use
of that API.

**8. No CI workflow existed.**
`.github/` didn't exist at all — every verification pass recorded in
`PROJECT_STATUS.md` across 9 prior phases was run manually, with no
regression protection against a future change landing untested.
**Fix applied**: `.github/workflows/ci.yml` — two jobs, `checks` (lint,
`tsc --noEmit`, `npm run test`, `npm run i18n:check`, `npm run build`) and
`e2e` (installs Chromium, runs the full Playwright suite), on every push
to `main` and every PR. Uses **zero secrets** — runs the app in the same
full-demo-mode configuration every local verification pass in this project
has always used, which is also exactly what this app is designed to run
correctly in.
**Verification**: the workflow YAML parses correctly (validated with
`js-yaml`), and every step it runs was executed manually, in the same
order, in this sandbox, and passed — but **the workflow itself has not
been exercised by a real GitHub Actions runner** (none available here);
that remains to be confirmed on the first real push/PR.

**9. No dedicated end-to-end coverage of the actual critical user journey,
and no mobile-viewport test at all.**
The two pre-existing Playwright specs (`rtl.spec.ts`, `reduced-motion.spec.ts`)
each check one narrow property; neither walks the actual
launch→discover→concierge→journey→place-detail path, and nothing ran at a
phone viewport.
**Fix applied**: `tests/e2e/critical-journey.spec.ts` — real browser, real
demo-mode fallback (no API keys in this sandbox, so this exercises the
app's actual zero-key fallback path end to end, not a mock): language
choice → discovery field renders → open Concierge → pick an energy → a
real journey renders with at least one stop → tapping a stop opens the
real place-detail panel. `tests/e2e/mobile.spec.ts` — same launch sequence
at an iPhone-12-sized viewport (Chromium's own mobile emulation, since
only Chromium is installed in this sandbox — see the spec's own comment),
confirming critical chrome is reachable and nothing overflows.
**Test evidence**: both pass individually and together with the two
pre-existing specs (8/8 passing across 5 spec files, including under concurrent-worker load).

---

## Section-by-section results

### Secret management — verified clean
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`,
  `OPENWEATHER_API_KEY` are all read only from `lib/env.server.ts`
  (`import "server-only"` — a client-bundle inclusion is a **build-time
  error**, not just a lint warning, confirmed by this project's existing
  `*.client-guard.test.ts` suite).
- `lib/env.client.ts` contains only `NEXT_PUBLIC_*` values, as required.
- `.gitignore` excludes `.env*` except `.env.example`; confirmed via
  `git ls-files` that only `.env.example` (all blank placeholder values)
  is tracked.
- Searched the **entire git history** (`git log --all -p`) for
  secret-shaped strings (Anthropic `sk-ant-*`, Google `AIza*`, JWT-shaped
  `eyJ...` tokens, and `KEY=<non-blank>` patterns for all four server
  keys) — zero hits beyond one documented `dummy-test-key` placeholder in
  `PROJECT_STATUS.md`'s own baseline-verification notes. **No secret has
  ever been committed to this repository.**
- `lib/log.ts` actively **throws** if any log call includes a field named
  `lat`/`lon`/`ip`/`email`/`password`/`token`/`apikey`/`key`/`secret` —
  confirmed this is a real, enforced control (not just a comment) by
  reading its implementation; every actual `log.*` call site in every
  route uses only `{route, branch}`-shaped fields.
- No secret appears anywhere in this document.

### API security — see "Findings" above for the two fixes (#2, #3); the rest, verified clean:
- Every route validates its inputs (lat/lon bounds, category membership,
  zod schema for the concierge body) and returns `400` with a generic
  message, never an internal error/stack trace.
- Every outbound third-party call (`ipapi.co`, OpenWeather, Google Places,
  Anthropic) goes through `lib/fetchWithTimeout.ts` — a hard timeout on
  every one, confirmed by reading each call site's actual timeout value
  (3.5s geo, 4s weather, 5s places, 6s AI).
- Upstream failures always fall back to synthesized/demo data
  (`synthesize()` in weather, `synthesizePlaces()` in places, the
  hardcoded Nairobi default in geo) — **never silently presented as a
  live-data success**: every fallback response includes its own
  `source`/`mode` field (`"echo"`/`"fallback"`/`"demo"`) that the client
  already reads to label the UI accordingly (confirmed against
  `components/discovery/PlaceDetail.tsx`'s `field.demo` label and
  `Concierge.tsx`'s equivalent).
- Rate limiting: every route is rate-limited (`checkRateLimit`), with the
  AI endpoint intentionally stricter (10/min vs. 60/min for data routes).
  **Already self-documented as per-process, not distributed** —
  `lib/rateLimit.ts`'s own docstring states this plainly (confirmed by
  reading it fresh this phase, not just trusting the comment exists): on a
  multi-instance serverless deployment, a determined caller can get up to
  `limit × instance count` requests through, since each function instance
  keeps its own in-memory bucket map. Re-confirmed, not newly fixed —
  the documented upgrade path (Upstash Redis + `@upstash/ratelimit`) has
  no provisioned credentials and would be a new external dependency,
  which doesn't meet "smallest change with a demonstrated need" for this
  pass.
- `clientKey()`'s IP identification trusts the first `x-forwarded-for`
  value. This is only as reliable as the deployment platform's header
  handling — a client can set this header directly on any request that
  doesn't pass through a trusted reverse proxy that overwrites it. On
  Vercel's own edge network this is handled correctly; self-hosted without
  an equivalent trusted proxy in front, rate limiting becomes bypassable
  by IP-spoofing the header. **Documented, not independently fixable from
  application code** — it's a deployment-topology requirement, not a code
  bug.
- No route exposes internal error details, stack traces, or environment
  info to the client in any response body — confirmed by reading every
  `catch` block in every route; all of them log via `log.warn`/`log.error`
  (fields-only, never the raw error object) and return a fixed, generic
  message.

### Supabase and access control
- **Identity lifecycle**: `engine/useSupabaseSession.ts` bootstraps one
  anonymous sign-in session per browser; re-confirmed it never persists or
  logs any token, and no-ops entirely (doesn't even import the SDK) when
  Supabase isn't configured.
- **RLS — static SQL-level analysis** (no live database available; see
  "Live verification still required"):
  - `visitors`: the `set_visitor_user_id()` trigger forces
    `new.user_id := auth.uid()` on every insert/update, `user_id` is
    `NOT NULL`, and the policy's `USING`/`WITH CHECK` both require
    `user_id = auth.uid()`. Traced through the logic by hand: a genuinely
    unauthenticated insert (`auth.uid()` is `NULL`) fails the `NOT NULL`
    constraint rather than silently succeeding as an orphan row; a client
    cannot claim another `user_id` because the trigger overwrites whatever
    they send, before the `WITH CHECK` even evaluates.
  - `affinities`/`interactions`/`saved_places`: both `USING` and
    `WITH CHECK` require `visitor_id in (select id from visitors where
    user_id = auth.uid())` — traced that a client cannot read or write
    (including re-pointing an existing row's `visitor_id` via `UPDATE`) any
    row belonging to a `visitor_id` they don't own. **A user cannot read
    or modify another user's private data, by this analysis** — not
    independently confirmed by executing a query against a real database.
  - `ai_suggestions`/`city_moods`: RLS enabled, a `SELECT ... USING (true)`
    policy only — no `INSERT`/`UPDATE`/`DELETE` policy exists for either
    table, so Postgres's RLS default-deny means only the service-role key
    (which bypasses RLS entirely, by Supabase's own documented design) can
    write to them. Appropriately locked down for their "server-written,
    public-read, no personal data" design.
  - **No application code reads or writes any of these five tables yet**
    (confirmed: zero `.from("visitors"|"affinities"|"interactions"|
    "saved_places"|"city_moods"|"ai_suggestions")` calls anywhere in the
    source) — so the live attack surface for all of the above is currently
    zero; this is infrastructure-in-waiting, not yet exercised by any real
    request.
  - The new presence migration (`20261019000000_presence_realtime_authorization.sql`)
    enables RLS on `realtime.messages` with `authenticated`-only policies
    scoped to `presence:city:%` topics. Reasoned through Supabase's
    documented Realtime Authorization mechanism; **the exact helper
    function name (`realtime.topic()`) and behavior should be
    re-confirmed against the target project's actual Supabase/Realtime
    version before applying**, since this feature has evolved across
    Supabase releases — flagged explicitly in the migration's own header,
    not glossed over.
- **Grants**: no explicit `GRANT`/`REVOKE` statements exist in any
  migration beyond RLS policies — relies on Supabase's own default role
  grants (`anon`/`authenticated` get table-level access, RLS policies then
  narrow row visibility). Standard Supabase pattern, not flagged as a gap.
- **Do not claim RLS is live-verified**: it is not. No hosted Supabase
  project is linked in this environment and the local Docker daemon
  needed for `supabase start` is installed but not running (`docker ps`
  fails with a connection error, confirmed this phase, not assumed from
  prior notes) — same blocker every prior phase touching Supabase has
  hit. The analysis above is a careful manual trace of the policy SQL,
  not a query execution.

### AI security and cost controls — re-verified, no new issues found
- Model output validated twice: structurally (zod, via
  `client.messages.parse` + `zodOutputFormat`) and semantically
  (`lib/ai/validate.ts` — every `placeId` must be a member of the posted
  candidate set; `narrative`/`reason` are bounded strings, never free-form
  beyond their length caps).
- **Model output cannot execute code**: confirmed via a full-repo grep —
  zero uses of `dangerouslySetInnerHTML` (except the one, fully-static
  JSON-LD block added this phase — see finding #7), `eval`, or
  `new Function` anywhere in the codebase. AI-generated text only ever
  reaches the DOM through normal JSX text interpolation, which React
  escapes by construction.
- **No URL field exists anywhere in the AI response schema** —
  `ConciergeAIResponseSchema` has only `narrative` and
  `{placeId, reason}` stops. There is no model-generated URL for the app
  to trust or not trust, by construction.
- Prompt bounding: candidates capped at 24 sent to the model (posted
  request already capped at 60 by the schema), `max_tokens: 1024`,
  `effort: "low"`, a 6-second timeout.
- Caching: `lib/ai/cache.ts`'s fingerprint deliberately excludes
  `favorites` (personal/learned taste) and the exact candidate list —
  confirmed no personal data is part of the cache key or ever logged
  alongside a cache hit (`log.info({route, branch: "cache_hit"})` only).
  A cached response is **re-validated against the requesting visitor's
  own candidate set** on every hit, which also incidentally prevents a
  cross-visitor cache hit from ever surfacing a place the current visitor
  doesn't actually have nearby (if none of the cached stops survive that
  re-validation, the hit is discarded and a fresh request is made).
  **Minor data-quality nit, not a security issue**: the cached
  `narrative` free text itself isn't independently re-validated the way
  `stops` are, so a cross-visitor cache reuse could in principle serve
  narrative prose that was written about a slightly different candidate
  set than the one that survived validation. No personal or sensitive
  data is involved (business names are already public) — not fixed this
  pass, noted for a future narrative-engine pass.
- Fallback behavior: a `null` "ai" result (missing key, timeout, upstream
  failure, or invalid response) is honest and uniform — the client always
  falls back to the already-displayed deterministic journey, never shows
  an error, never fabricates a result.
- **Tested, all with mocks (no live Anthropic key used or required)**:
  malformed input (400, AI boundary never called), empty candidate list
  (400), malformed JSON body (400), a prompt-injection attempt via a
  candidate's `name` field (validation is id-based, confirmed resistant),
  the model inventing a place id (dropped), every id being invalid
  (falls back cleanly), rate limiting, caching, and (new this phase) an
  oversized request body. **11 tests, `app/api/concierge/route.test.ts`,
  all passing.**

### Dependency and supply-chain review
`npm audit` **before** this phase: 17 vulnerabilities (3 moderate, 11
high, 3 critical). **After** `npm audit fix` (no `--force`): **11**
(3 moderate, 6 high, 2 critical) — `next` itself resolved from CRITICAL to
MODERATE (see Finding #1).

**Remaining, assessed and left unresolved on purpose**:
| Package | Severity | Why not fixed |
|---|---|---|
| `postcss` (nested inside `next`'s own vendored copy) | High→part of next's moderate entry | Full fix requires Next **v16**, a major version — not attempted blind in this pass; re-assess alongside a dedicated Next-v16 migration task |
| `eslint-config-next` + transitive `fast-glob`/`braces`/`micromatch`/`@next/eslint-plugin-next` | High | `npm audit fix --force`'s only available resolution is `eslint-config-next@14.2.35` — a **downgrade** from the current version, not an upgrade. Dev-tooling only (lint-time), never shipped or executed against untrusted input in production. Not applied. |
| `vitest` + transitive `tinypool`/`@vitest/mocker`/`@vitest/ui` | Critical/Moderate | Fix requires `vitest@5.x`, a major version bump that risks `vitest.config.ts`'s carefully-tuned dual-project setup (`server-only` resolve-condition handling, documented in that file's own extensive comments). Dev/test-tooling only, never shipped to production, and the "prototype pollution to RCE" path requires controlling the test-runner's own worker options — not reachable by anything this app exposes to the public internet. Not applied this pass; recommend a dedicated, isolated vitest-5 migration task. |

No dependency was upgraded indiscriminately — every change was the
non-breaking `npm audit fix` pass only, verified compatible by a full
lint/typecheck/test/build/e2e re-run (all green, see "Build status" in
the completion report).

### SEO and social metadata
See Findings #6–#7 for what changed. Everything else, checked and
confirmed already correct: `robots.txt` (disallows `/api/`, correct
sitemap/host references — verified against the actual generated output,
not just source), `sitemap.xml` (one canonical URL entry, matches the
app's deliberate single-entry-point design), page title/description
(accurate, not keyword-stuffed), locale metadata (`<html lang>` — see
Phase 9's own documented, deliberate tradeoff around this, unchanged
here), indexability (no stray `noindex`, confirmed via the generated
`<head>`). **No structured-data facts were invented** — the new JSON-LD
and the OG/Twitter copy all reuse text already present elsewhere in the
same file. SEO changes were verified to **not** force `/` into dynamic
rendering — confirmed via `next build`'s own route markers before and
after (`○` static, unchanged, First Load JS unchanged).

### End-to-end quality assurance
Critical journeys covered, with automated (not manual) browser-based
tests:
1–4 (launch, env init, demo-mode discovery, place ranking flowing into a
real UI element): `tests/e2e/critical-journey.spec.ts`.
5–7 (concierge journey generation, AI fallback): the deterministic half is
covered live by `critical-journey.spec.ts`; the AI-upgrade half is covered
by `components/concierge/Concierge.test.tsx`'s mocked-fetch tests (not a
live Anthropic call — none is configured in this sandbox).
8–9 (language switching, RTL): `tests/e2e/rtl.spec.ts` +
`components/i18n/LanguageGate.test.tsx`/`LangSwitcher.test.tsx`.
10 (saved preferences/persistence): `useLang`'s zustand `persist`
middleware, tested in `LanguageGate.test.tsx`/`LangSwitcher.test.tsx`
(the "manual choice overrides later auto-detect" + localStorage-flag
tests). **Gap, acknowledged**: `useAdaptiveMind` (affinities/mode/energy
persistence) has no dedicated test file — lower risk, since it's the same
well-established zustand-persist pattern already proven correct for
`useLang`, but not independently verified this phase.
11 (presence lifecycle): `engine/usePresence.test.tsx` (10 tests, from
Phase 9).
12 (mobile layout): `tests/e2e/mobile.spec.ts` (new).

**All browser-based tests ran via Playwright against a real Chromium
instance in this sandbox** — none of this is reported as a manual check.

### CI and regression protection
See Finding #8. `.github/workflows/ci.yml` added; every step it runs was
independently verified locally this phase. The workflow itself has not
yet been exercised by a real GitHub Actions runner.

---

## Outstanding risks (not fixed this phase, with reasons)

1. Rate limiting is per-process, not distributed (documented, not newly
   introduced — see "API security" above).
2. `x-forwarded-for`-based client identification is only as trustworthy as
   the deployment platform's proxy handling.
3. `postcss` (nested in `next`), `eslint-config-next`'s transitive chain,
   and `vitest`'s transitive chain remain unresolved — see the dependency
   table above for why each was deliberately left alone.
4. No Content-Security-Policy — needs real browser verification against
   Google Maps' script loading before it can ship safely.
5. AI concierge narrative text isn't independently re-validated against
   the serving visitor's exact candidate set the way `stops` are (minor
   data-quality nit, not a security/privacy issue — see "AI security"
   above).
6. `useAdaptiveMind` persistence has no dedicated automated test (lower
   risk, same proven pattern as `useLang`).

## Live verification still required (human action)

1. **RLS policies** (both the identity-RLS migration and the new
   presence-authorization migration) — apply to a real or local
   Docker-backed Supabase project and execute an actual cross-user access
   test; this audit's RLS findings are a careful SQL-level trace, not a
   query execution, per the instruction not to claim live verification
   without one.
2. **Realtime Authorization's exact SQL** — confirm `realtime.topic()`
   and the policy shape match the target Supabase project's actual
   Realtime version before applying.
3. **The CI workflow** — confirm it runs green on the first real GitHub
   Actions execution (push or PR); it was never executed by an actual
   runner in this sandbox.
4. **Real API keys** (Google Maps, OpenWeather, Anthropic, Supabase) —
   every finding in this audit about these integrations was verified at
   the code/schema/mock level; none has been exercised against a real
   upstream service in this sandbox.

---

## Verification (this phase)

- `npm run lint` — 0 errors/warnings.
- `npx tsc --noEmit` — clean.
- `npm run test` — **34 files / 181 tests, all passing** (was 33/176
  before this phase's two new route tests; +1 net since this phase added
  2 new tests across the concierge/geo route suites alongside other
  unrelated changes this session).
- `npm run build` — clean; `/` still `○` static; First Load JS unchanged
  at 119 kB/222 kB.
- `npx playwright test` — **8/8 passing** (both pre-existing specs plus
  the two new ones added this phase), including under concurrent-worker
  load.
- Metadata/OG image verified against the **actual running production
  server** (`npm run start` + `curl`), not just source inspection.
- Security headers verified against the actual running production server
  on both a page route and an API route.
