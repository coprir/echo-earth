# Environment & configuration

How ECHO EARTH's environment variables are validated, scoped, and separated
across development/preview/production, plus the authoritative per-variable
reference (Phase 11 — production readiness). `.env.example` stays the
copy-paste starting point; this table is the one place that documents
*why* each variable exists and exactly how exposed it is.

## Environment variable reference

**Every variable below is optional.** The app is designed to run correctly
in full demo mode with zero variables set — verified this phase, fresh,
against a clean production build and a real browser (`RELEASE_CHECKLIST.md`
has the evidence). Nothing on this list is required to launch.

This is the complete list — confirmed by grepping every `process.env.*`
reference in the codebase; nothing is read outside `lib/env.server.ts`/
`lib/env.client.ts`'s validated schemas except Playwright's own standard
`CI` variable.

| Variable | Purpose | Exposure | Required for | Configure in |
|---|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Places API (New) — real nearby places instead of synthesized "echo" places | **Secret, server-only** | Live place data (`/api/places`) | `.env.local`, or the hosting platform's server-side env scope |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript SDK — the mood-styled live map tiles under the neural field (`components/map/LivingMap.tsx`) | **Public** — ships in the client bundle by Next.js's own `NEXT_PUBLIC_*` convention; this is Google's own client-side Maps key model, not a leak | Live map tiles | `.env.local`, or the hosting platform (all environments, since it reaches the browser) |
| `OPENWEATHER_API_KEY` | Live weather via OpenWeather instead of synthesized seasonal weather | **Secret, server-only** | Live weather (`/api/weather`) | `.env.local`, or the hosting platform's server-side env scope |
| `ANTHROPIC_API_KEY` | AI Concierge narrative/ordering upgrade (`/api/concierge`) — the deterministic journey is the baseline either way | **Secret, server-only** | The "✦ AI-refined" journey upgrade only; the Concierge is fully functional without it | `.env.local`, or the hosting platform's server-side env scope |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | **Public** — a project identifier, not a secret; also read server-side (`lib/env.server.ts`) for the admin client, which needs to know which project to connect to | Any Supabase-backed feature (anonymous identity, future cross-device memory, realtime presence) | `.env.local`, or the hosting platform (all environments) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public API key — the browser client; access control comes from Row Level Security, not from keeping this key secret (by Supabase's own design) | **Public** by design | Same as above | `.env.local`, or the hosting platform (all environments) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — bypasses RLS entirely; used only by `lib/supabase/server.ts`'s admin client | **Secret, server-only — never client-exposed, enforced at build time by the `server-only` package** | No current code path actually calls the admin client yet (see `ARCHITECTURE.md` §9) — provisioned for when one does | `.env.local`, or the hosting platform's **production-only, server-side** env scope (never a preview/shared scope — see "Development / preview / production separation" below) |

**Test-only values** (not a real environment variable — mentioned here so
it isn't confused with one): `.github/workflows/ci.yml` sets short, clearly
-labeled dummy strings (e.g. `ci-dummy-anthropic-key-not-real`) for the
four secret variables above, for exactly one purpose — proving
`scripts/checkSecretsInBundle.ts` actually detects a real secret value if
one ever leaked into the client bundle. These values are never used to
call a real API, never appear outside that one CI job, and are not
something to set in any real environment.

## Validation layers

- **`lib/env.server.ts`** — every server-only variable (`GOOGLE_MAPS_API_KEY`,
  `OPENWEATHER_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`), parsed once with `zod`. Every key is optional —
  the app must keep working in full demo mode with zero variables set — but a
  key that *is* set and malformed (e.g. a non-URL `NEXT_PUBLIC_SUPABASE_URL`)
  fails fast at import time instead of surfacing as a confusing runtime error
  deep in a fetch call.
- **`lib/env.client.ts`** — the `NEXT_PUBLIC_*` subset, safe to import from
  any component. Nothing in this file is or should ever become a secret.
- Both files guard against drift from `.env.example`: if you add a new env
  var anywhere in the app, it must be added to the matching schema here (and
  to `.env.example`) or `process.env.YOUR_VAR` won't be validated at all and
  TypeScript won't know it exists.

## The server/client boundary

`lib/env.server.ts`, `lib/log.ts`, and `lib/supabase/server.ts` all start with
`import "server-only"`. This is not just a convention — it's enforced by
Next.js's bundler: if any of these modules end up reachable from a Client
Component's bundle, the **build fails**, not just lints with a warning. This
is the mechanism that keeps `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY`
out of the browser (see `SEC-4`/`SUP-8` in `IMPLEMENTATION_PLAN.md`).

Tests for these modules run under a dedicated Vitest "node" project
(`vitest.config.ts`) with the `"react-server"` resolve condition explicitly
enabled, so their logic is testable without re-deriving a working Next.js
server-component build for every test run. The `*.client-guard.test.ts`
files run under the separate "jsdom" project *without* that condition,
which makes `server-only` throw exactly as it would from a real client
bundle — that throw is the thing under test, not a flake.

## Development / preview / production separation

This repo doesn't yet have a hosted Supabase project, so this section
documents the *required* separation for whoever provisions one (see
`REQUIRES HUMAN ACTION` notes in `PROJECT_STATUS.md`/commit history), rather
than describing something already wired up:

- **Local development**: `.env.local` (gitignored), demo mode by default. A
  local Supabase instance (`supabase start`, via the Supabase CLI already
  vendored in `supabase/`) can be pointed at for Supabase-backed features
  once Docker is available and running.
- **Preview deploys** (e.g. Vercel preview deployments per-PR): must point at
  a **separate, disposable Supabase project** from production — never share
  credentials between preview and production. A preview deploy writing test
  interactions into production's `interactions` table would corrupt real
  personalization data and real `city_moods` aggregates.
- **Production**: its own Supabase project, its own API keys, its own rate
  -limit budgets. Service-role credentials are set only in the production
  environment's server-side variable scope (e.g. Vercel's "Production"
  environment target) — never in a scope a preview build or a client bundle
  can read.

Each scope gets the same `.env.example` keys; what differs is *which actual
project/key* each points at, and that production's service-role key is never
copied into a lower environment's config.

## REQUIRES HUMAN ACTION — enabling anonymous visitor identity

`engine/useSupabaseSession.ts` and the RLS fix in
`supabase/migrations/20261005232553_fix_anonymous_visitor_rls.sql` depend on
**Supabase Anonymous Sign-ins**, which only a project owner can turn on —
no migration, CLI command, or application code can enable it:

1. In the Supabase dashboard, open the project → **Authentication** →
   **Sign In / Providers** → enable **Allow anonymous sign-ins**.
2. Apply the migrations (`supabase db push` or `supabase migration up`
   against that project, once linked via `supabase link`).
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` for the relevant environment scope.

Until that's done, `getSupabaseBrowserClient()`/`getSupabaseAdminClient()`
both return `null` (no env vars set) and `useSupabaseSession()` no-ops —
the app runs exactly as it does today, with zero behavior change. The RLS
fix itself (strict `user_id = auth.uid()`, a trigger forcing `user_id` from
the session rather than trusting client input) is also unverified against a
live database in this environment: no hosted Supabase project is linked, and
the local Docker daemon needed for `supabase start` isn't running here
(Docker CLI is present; the daemon is not) — see `PROJECT_STATUS.md`. Running
the migration locally (`supabase start && supabase db push`, once Docker
Desktop is started) or against a real project is the needed verification
step before any live Supabase traffic should flow through this schema.

A second, later migration
(`supabase/migrations/20261019000000_presence_realtime_authorization.sql`,
realtime explorer presence) depends on the *same* anonymous-sign-in setting
above — no separate dashboard toggle — but adds its own required manual
verification step once applied (confirm an authenticated session can join
a `presence:city:*` channel and an unauthenticated one is rejected); see
that migration's own header and `docs/realtime-presence.md` for the full
checklist. Same live-verification blocker as above: not yet run against
any real Supabase project.
