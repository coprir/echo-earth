# Deployment & database release readiness (Phase 11)

Everything in this document is **preparation, not execution** — no
production infrastructure was touched, no release was published, no live
database policy was changed, and no paid service was configured while
writing it. See `RELEASE_CHECKLIST.md` for the current READY / BLOCKED /
REQUIRES HUMAN ACTION status of each item here.

## Hosting recommendation: Vercel

**Evidence this app already assumes Vercel**, found by inspecting the
actual source rather than guessing:
- `app/api/geo/route.ts` reads `x-vercel-ip-latitude`/`x-vercel-ip-longitude`/
  `x-vercel-ip-city`/`x-vercel-ip-country` as its **first-choice**
  geolocation strategy (with a Cloudflare-header and IP-lookup fallback for
  anywhere else) — these headers only exist on Vercel's own edge network.
- `app/api/geo/route.ts` declares `export const runtime = "edge"`, a
  Vercel/Next-native deployment primitive.
- `ARCHITECTURE.md` §9 states "deployable to Vercel edge" and `docs/
  environment.md`'s environment-separation section is written entirely in
  terms of "Vercel preview deployments" and "Vercel's Production
  environment target."
- `README.md`'s "Live home" link (`echoearthh.com`) implies an existing
  production deployment already using this model.

No `vercel.json` exists, but **none is needed** — this is a standard
Next.js App Router project with no custom routing/headers/redirects beyond
what `next.config.ts` already declares (which Vercel reads natively), so
Vercel's zero-config Next.js detection applies as-is.

**Alternative considered**: a generic Node host / Docker (self-hosted).
The app runs correctly there too (`npm run build && npm run start`,
verified this phase) — it would just lose the free `x-vercel-ip-*`
geolocation header and fall back to the `ipapi.co` IP-lookup strategy
(already implemented and tested), and would need its own reverse-proxy
configuration to make `clientKey()`'s `x-forwarded-for`-based rate
limiting trustworthy (see `SECURITY_AUDIT.md`'s "API security" section —
this is a real, documented dependency on the hosting platform correctly
setting, not just passing through, that header). Recommended only if
there's a specific reason to avoid Vercel; otherwise Vercel is the lower
-effort, better-matched choice given the app already assumes it.

**Decision**: recommend Vercel. **Not executed** — no account access, no
authorization to provision hosting in this session.

## Vercel deployment — exact steps

### Prerequisites
- A Vercel account/team with permission to create a new project.
- This repository pushed to a Git provider Vercel can connect to (GitHub,
  GitLab, or Bitbucket).
- Whichever of the 7 optional env vars (see `docs/environment.md`'s
  reference table) you intend to configure — the app deploys and runs
  correctly with **zero** of them set, so none are a hard prerequisite.
- If using Supabase: a provisioned Supabase project with **Anonymous
  Sign-ins** enabled (dashboard toggle — see `docs/environment.md`'s
  "REQUIRES HUMAN ACTION" section) and both migrations applied, before
  setting the Supabase env vars in Vercel (setting them before the
  migrations are applied would let the app attempt real Supabase calls
  against a schema/RLS state that doesn't match this codebase's
  expectations).

### 1. Connect the repository
In the Vercel dashboard: **Add New → Project → Import Git Repository**,
select this repo. Vercel auto-detects Next.js — no framework preset
changes needed.

### 2. Environment variables
In **Project Settings → Environment Variables**, add whichever of the 7
keys in `docs/environment.md`'s reference table you're enabling, each
scoped to the correct environment:
- **Production** scope: production Supabase project's keys, production
  API keys.
- **Preview** scope: a **separate, disposable** Supabase project (never
  production's — see `docs/environment.md`'s "Development / preview /
  production separation"), test-tier or the same read-only-safe API keys.
- **Development** scope: optional; most contributors will just use
  `.env.local` instead.

Never paste a real secret into this repository, a commit, or this
document — set values directly in Vercel's dashboard or via `vercel env
add` from an authenticated CLI session.

### 3. Database migrations (if using Supabase)
Run **before** the first deploy that sets Supabase env vars, from a
machine with the Supabase CLI and network access to the project (not
required to run from this repo's CI):
```
supabase link --project-ref <your-project-ref>
supabase db push
```
This applies all three migrations in `supabase/migrations/`, in their
timestamp order (`20261005230110_init.sql` →
`20261005232553_fix_anonymous_visitor_rls.sql` →
`20261019000000_presence_realtime_authorization.sql`). See "Migration
prerequisites and order" below for what each one requires and why the
order matters.

### 4. Build command / runtime settings
Defaults are correct and don't need overriding: Vercel runs `npm install`
then `npm run build` (= `next build`), and serves via its own Next.js
runtime integration. `app/api/geo/route.ts`'s `export const runtime =
"edge"` is honored automatically; every other route runs on Vercel's
Node.js serverless runtime. No custom `vercel.json` build/output
overrides are needed.

### 5. Domain configuration
`app/layout.tsx`'s `metadataBase` and `app/sitemap.ts`/`app/robots.ts` all
hardcode `https://echoearthh.com`. If deploying to that domain: add it
under **Project Settings → Domains** and point its DNS at Vercel per
Vercel's own instructions (A/CNAME records shown in that UI). If deploying
to a **different** domain (e.g. a staging subdomain), update those three
hardcoded URLs first — deploying to a different domain without updating
them would ship incorrect canonical/OG/sitemap URLs pointing at the wrong
site.

### 6. Post-deployment verification
Run through `RELEASE_CHECKLIST.md`'s "Manual smoke tests" section against
the real deployed URL — this document's own local verification (however
thorough) is not a substitute for checking the actual deployed instance,
since platform-specific behavior (the `x-vercel-ip-*` headers chief among
them) can only be observed there.

### 7. Rollback procedure
Vercel keeps every previous deployment addressable and promotable:
**Project → Deployments → [previous good deployment] → Promote to
Production**. This is an instant DNS/routing change, not a rebuild — the
fastest available rollback. For a database-schema-related issue
specifically, see "Rollback limitations" below — rolling back the
*application* this way does **not** roll back a database migration that
was already applied.

## Migration prerequisites and order

| # | File | Depends on | What it needs before applying |
|---|---|---|---|
| 1 | `20261005230110_init.sql` | — | A fresh or compatible Supabase project; creates `visitors`/`affinities`/`interactions`/`saved_places`/`ai_suggestions`/`city_moods` and enables RLS with (intentionally superseded) initial policies |
| 2 | `20261005232553_fix_anonymous_visitor_rls.sql` | Migration 1 applied | **Supabase Anonymous Sign-ins enabled in the dashboard first** (Authentication → Sign In/Providers) — this migration's trigger relies on every session having a non-null `auth.uid()`, which anonymous sign-in provides; applying it before enabling that setting means no visitor could ever get a valid session and every write would correctly-but-unhelpfully fail the `NOT NULL` constraint |
| 3 | `20261019000000_presence_realtime_authorization.sql` | Migrations 1–2 applied, same Anonymous Sign-ins setting | Enables Realtime Authorization (RLS on `realtime.messages`) — independent of the application tables, but reuses the same identity requirement |

**No application code reads or writes any table from migration 1 yet**
(confirmed by grep, zero `.from("visitors"|...)` calls anywhere in the
source — see `SECURITY_AUDIT.md`) — so applying migrations 1–2 has zero
live effect on current traffic beyond what `engine/useSupabaseSession.ts`
already does (bootstrap a session). Migration 3 has live effect only once
`engine/usePresence.ts` is enabled by the app being `awake` with Supabase
configured.

## Backup requirements

Before applying any migration to a project that already has real visitor
data (i.e., any run after the first): take a Supabase point-in-time or
manual backup first (**Project → Database → Backups** in the dashboard,
or `pg_dump` via the connection string for a portable copy). This repo has
never been applied to a project with real data in it, so no backup has
been needed or taken during development — this is guidance for the
project owner's first real deployment, not a step already completed.

## RLS verification

**Static analysis only — not live-verified.** `SECURITY_AUDIT.md`'s
"Supabase and access control" section has the full hand-traced policy
analysis for all three migrations (a user cannot read/write another
user's `visitors`/`affinities`/`interactions`/`saved_places` row, by that
analysis; `ai_suggestions`/`city_moods` are correctly read-only for
non-service-role callers). No pgTAP suite or live query has executed
against a real Postgres instance with this schema — the local Docker
daemon needed for `supabase start` is installed but not running in this
sandbox (confirmed by `docker ps` failing with a connection error).

**Required before production traffic flows through this schema**: apply
the migrations to a real (or local Docker-backed) Supabase project and
run an actual cross-user access test — two distinct anonymous sessions,
confirm session A cannot read or write session B's `visitors`/
`affinities`/`interactions`/`saved_places` rows via the anon client.

## Rollback limitations

- **Application rollback** (via Vercel's deployment promotion, above) is
  fast and safe on its own.
- **Database migrations do not automatically roll back** with an
  application rollback. None of the three migrations in this repo include
  a corresponding "down" migration — Supabase's CLI-based migration model
  doesn't generate these automatically, and none was hand-written here.
  Rolling back `20261019000000_presence_realtime_authorization.sql` would
  mean hand-writing and applying a migration that drops its two RLS
  policies and disables RLS on `realtime.messages` again (risky — leaves
  that relation unprotected until a new policy is in place, so do this
  only with a maintenance window, not casually). Rolling back migration 2
  (the anonymous-identity RLS fix) is **not recommended at all**: it would
  restore the known-insecure `user_id is null` policy documented in
  migration 1's own comments as letting any anonymous caller read/write
  any other anonymous visitor's data.
- **If a migration needs reverting**, write a new, explicit, reviewed
  migration that undoes it — never a manual, undocumented dashboard SQL
  edit, which would drift the live schema away from what the migration
  files describe and break `supabase db push`'s ability to reproduce the
  schema from source later.

## External services — configuration, verification, fallback, cost, failure modes

For each: what depends on it, how to configure it securely, how to verify
it's actually working, what happens when it isn't, and what to watch for
cost-wise. **None of these four have been tested with valid credentials in
this sandbox** — every fallback/failure-mode claim below is verified via
code reading, unit/integration tests against mocks, and (for the invalid
-key path specifically) a real request against a dummy/invalid key this
phase; none is a claim of live, successful third-party integration.

### Google Maps / Places
- **Depends on it**: `GOOGLE_MAPS_API_KEY` → real nearby places
  (`/api/places`, Places API (New) `searchNearby`). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  → live map tiles (`components/map/LivingMap.tsx`, Maps JavaScript SDK).
  Independent of each other — either can be set without the other.
- **Configure securely**: `GOOGLE_MAPS_API_KEY` server-side only, restricted
  in the Google Cloud Console to the Places API (New); `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  is inherently public (ships to the browser) — restrict it by HTTP
  referrer (your real domain) in the Cloud Console so it can't be used
  from another site even though it's visible in your own page source.
- **Verify**: hit `/api/places?lat=<x>&lon=<y>&category=cafes` with the key
  set; a successful response has `"mode":"live"`, a failed/invalid key
  falls back to `"mode":"echo"` with no error surfaced — confirmed this
  phase with a deliberately invalid key (logged `error:status_400`
  server-side, zero client-visible error, synthesized places returned).
- **Fallback**: `synthesizePlaces()` (deterministic, seeded per
  lat/lon/category) — the app's default, always-on experience.
- **Cost/quota**: Places API (New) is billed per request past Google's
  free monthly credit; Maps JavaScript SDK similarly. Check current
  pricing/quotas in the Google Cloud Console before enabling in
  production — not reproduced here since pricing changes independently of
  this codebase and a stale number here would be worse than none.
  `/api/places` is rate-limited to 60 req/min/IP (`lib/rateLimit.ts`),
  which bounds worst-case request volume per visitor but not total traffic.
- **Likely failure modes**: invalid/restricted key → `401`/`403` from
  Google, caught and falls back to echo data (verified). Quota exhaustion →
  same fallback path (any non-OK response triggers it). Network timeout →
  5s hard timeout (`lib/fetchWithTimeout.ts`), same fallback.

### OpenWeather
- **Depends on it**: `OPENWEATHER_API_KEY` → live weather (`/api/weather`).
- **Configure securely**: server-only; OpenWeather's free tier doesn't
  support domain restriction the way Google's does, so there's nothing
  further to scope — just keep it out of client code (already enforced by
  `lib/env.server.ts`'s `server-only` guard).
- **Verify**: hit `/api/weather?lat=<x>&lon=<y>` with the key set; success
  has `"source":"openweather"`, failure falls back to `"source":"echo"` —
  confirmed this phase with an invalid key (`401` logged server-side, zero
  client-visible error).
- **Fallback**: `synthesize()` — deterministic weather from latitude +
  season + hour, changes daily, not per-request.
- **Cost/quota**: OpenWeather's free tier has a per-minute/per-month call
  cap; check current limits on their pricing page before enabling at
  scale. `/api/weather` is rate-limited to 60 req/min/IP.
- **Likely failure modes**: invalid key → `401`, falls back (verified).
  Rate-limit exceeded on OpenWeather's side → non-OK response, same
  fallback. Network timeout → 4s hard timeout, same fallback.

### Anthropic (AI Concierge)
- **Depends on it**: `ANTHROPIC_API_KEY` → the "✦ AI-refined" journey
  narrative/ordering upgrade (`/api/concierge`). The Concierge's core
  journey-building is fully deterministic and functional without this key
  — see `docs/ai-concierge.md`'s degradation-ladder documentation.
- **Configure securely**: server-only (`lib/ai/anthropic.ts`, guarded by
  `server-only`). No further scoping available from Anthropic's side
  beyond the key itself; rotate it from the Anthropic console if ever
  exposed.
- **Verify**: no real key has been used in this project at any point
  (confirmed across every phase's own notes) — verification has only ever
  been possible at the mocked-SDK-boundary level (`app/api/concierge/route.test.ts`,
  11 tests). **The actual `POST /v1/messages` call path has never executed
  against the real Anthropic API in this codebase's history.** Once a real
  key is configured, the concrete verification step is: open the
  Concierge, pick an energy, confirm the "✦ AI-refined" label appears
  (only shown when a real AI response was validated and used — see
  `components/concierge/Concierge.tsx`) within the request's 6-second
  timeout.
- **Fallback**: the deterministic journey, already fully rendered before
  the AI call is even made (`enhanceWithAI` is additive, never blocking).
- **Cost/quota**: billed per token; `lib/ai/anthropic.ts` caps
  `max_tokens: 1024` and requests `effort: "low"` to bound cost per call.
  `/api/concierge` is rate-limited to 10 req/min/IP (stricter than the
  data routes, specifically because this one costs real money per call) and
  responses are cached 20 minutes per context-fingerprint
  (`lib/ai/cache.ts`) to avoid repeat-paying for the same common context.
  Check current Claude pricing before enabling at scale.
- **Likely failure modes**: missing/invalid key → `requestConciergeCompletion`
  returns `null`, route responds `{ai: null}` (verified by test). Timeout
  (6s) → same. Malformed/schema-invalid model output → the same `null`
  path, verified by test with a mocked adversarial response. A model
  response referencing a place id outside the posted candidate set → that
  stop is dropped, not the whole response (verified by test) — see
  `SECURITY_AUDIT.md`'s "AI security" section for the full prompt-injection
  -resistance testing record.

### Supabase
- **Depends on it**: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  → anonymous visitor identity (`engine/useSupabaseSession.ts`) and
  realtime explorer presence (`engine/usePresence.ts`). `SUPABASE_SERVICE_ROLE_KEY`
  → the admin client (`lib/supabase/server.ts`) — provisioned, not yet
  called by any route.
- **Configure securely**: anon key is public by design (RLS enforces
  access control); service-role key is server-only, production-scoped
  only (never preview/shared) — see `docs/environment.md`'s reference
  table and separation guidance.
- **Verify**: no live Supabase project has been linked at any point in
  this project's history. Verification so far is entirely at the
  mock/static-analysis level — see `SECURITY_AUDIT.md`'s "Supabase and
  access control" section and `docs/deployment.md`'s own "RLS
  verification" above for exactly what's confirmed vs. not. Once a
  project is linked and migrations applied, the concrete verification
  steps are in that section.
- **Fallback**: `getSupabaseBrowserClient()`/`getSupabaseAdminClient()`
  both return `null` when unconfigured; every caller already checks for
  `null` and no-ops — confirmed by `lib/supabase/client.test.ts`/
  `server.test.ts` and by `engine/useSupabaseSession.ts`/`usePresence.ts`'s
  own early-return guards.
- **Cost/quota**: Supabase's free tier has project-count, database-size,
  and monthly-active-user limits; check current limits before relying on
  it in production. No cost-control mechanism beyond what RLS/rate
  limiting already provide is implemented for Supabase usage specifically,
  since no application code writes to it yet.
- **Likely failure modes**: unconfigured → silent no-op (verified, by
  design). Misconfigured (bad URL/key) → `lib/env.server.ts`/
  `lib/env.client.ts`'s zod validation fails fast at import/build time for
  a malformed URL; a well-formed-but-wrong key would fail at the first
  real `auth.signInAnonymously()` call, caught and logged via
  `console.warn` in the browser console (`engine/useSupabaseSession.ts` is
  client-side code, so it genuinely cannot import `lib/log.ts` — that
  module is `server-only`-guarded; `console.warn` is the correct choice
  here, not an inconsistency to fix).

## Monitoring and operational readiness

**Current state, stated plainly rather than invented**: there is **no**
error-reporting service (e.g. Sentry), **no** uptime/health-check monitor,
and **no** dashboard/alerting configured anywhere in this project — confirmed
by grepping the whole source for any such integration (zero hits). The
only observability that exists today is:
- **Structured server logs** (`lib/log.ts`): one JSON line per event to
  stdout, captured natively by Vercel (and most platforms) as part of
  their standard function logs — no separate log-shipping setup needed to
  *see* these, only to search/alert on them at scale.
- **The browser console**, for client-side errors (not centrally
  collected anywhere).

### Logs don't contain what they shouldn't — verified, not assumed

`lib/log.ts` **actively throws** if any log call includes a field named
`lat`/`lon`/`lng`/`latitude`/`longitude`/`ip`/`ipaddress`/`email`/
`password`/`token`/`apikey`/`api_key`/`key`/`secret` (case-insensitive) —
a real, enforced control, not just a naming convention. Confirmed by
reading every actual `log.*` call site in every route this phase: all of
them pass only `{route, branch}`-shaped fields (e.g.
`{route: "/api/weather", branch: "error:status_401"}`), never raw
coordinates, never an IP, never a request body, never AI prompt/candidate
content, never a secret. The one `console.warn` outside this system
(`engine/useSupabaseSession.ts`, client-side, can't import the server-only
logger) only ever logs a Supabase SDK error message, never a credential.

### Health checks

No `/api/health` or equivalent endpoint exists. For a platform like Vercel,
this is commonly not required (the platform's own deployment health checks
cover "is the function responding at all"), but there is currently no
cheap way to check "is the *demo-mode fallback* itself healthy" beyond
hitting `/api/geo` and confirming a `200`. **Not built this phase** — a
reasonable, low-effort follow-up (a `GET /api/health` returning `{status:
"ok", mode: "demo"|"live", uptime}` with zero external calls) if synthetic
monitoring is wanted later.

### Practical failure investigation guidance

| Symptom | Where to look | What it means |
|---|---|---|
| Visitors see demo/synthesized data when real keys are configured | Platform function logs, filter for the relevant `route` field (`/api/weather`, `/api/places`, `/api/geo`) and `branch` starting with `error:` | The upstream API rejected the request or timed out — the `branch` value includes the HTTP status (e.g. `error:status_401` = bad key, `error:network_error` = timeout/DNS/connection failure) |
| AI Concierge never shows "✦ AI-refined" | Filter logs for `route: "/api/concierge"`; `branch: "no_result"` = the Anthropic call failed/timed out/no key; `branch: "invalid_response"` = the model's response didn't pass validation | Both are the *designed* fallback, not necessarily a bug — confirm `ANTHROPIC_API_KEY` is actually set for that environment first |
| A route returns `429` | `branch: "rate_limited"` in that route's logs | Expected behavior under load; remember the limiter is per-process (see "Known scaling limitations" below) — a `429` under *light* real traffic across multiple serverless instances would be a sign the limiter's per-instance nature is actually biting, not that traffic is genuinely heavy |
| Database errors (once Supabase is live) | No current code path surfaces these to logs distinctly — `engine/useSupabaseSession.ts`'s own `console.warn` is the only signal today | A real operational gap once Supabase is actually load-bearing; worth adding structured logging to that path (and to the admin client, once something calls it) before relying on Supabase in production |

### Known scaling limitations (restated here for operational awareness)

- **Rate limiting is per-process** (`lib/rateLimit.ts`'s own docstring,
  re-confirmed in `SECURITY_AUDIT.md`): on a multi-instance serverless
  deployment, effective limits are `configured limit × live instance
  count`, not the configured limit itself. Not a bug, a known,
  documented tradeoff — the upgrade path (Upstash Redis) is noted in
  `IMPLEMENTATION_PLAN.md`'s `DAT-1` but not provisioned.
- **The AI response cache** (`lib/ai/cache.ts`) and **presence state**
  (`engine/usePresence.ts`, via Supabase Realtime, not this app's own
  process) have the same per-process-memory caveat for the cache
  specifically — a cache hit on one serverless instance doesn't help a
  request that lands on another. Presence itself doesn't have this
  problem (Realtime state lives in Supabase's own infrastructure, not
  this app's process).

## Manual dashboard configuration required (cannot be scripted)

1. **Anonymous Sign-ins** — Authentication → Sign In/Providers → enable.
   No migration or CLI command can do this; it's an auth-provider-level
   project setting.
2. **Realtime enabled** — on by default for a new Supabase project
   (confirmed via `supabase/config.toml`'s local-dev default,
   `[realtime] enabled = true`); verify this wasn't disabled on the target
   project before relying on `engine/usePresence.ts`.
3. **Custom domain DNS** (if using `echoearthh.com` or another custom
   domain) — configured in Vercel's dashboard, per its own instructions,
   not something this repository can automate.
