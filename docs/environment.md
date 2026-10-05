# Environment & configuration

How ECHO EARTH's environment variables are validated, scoped, and separated
across development/preview/production. See `.env.example` for the full list
of keys and what each one unlocks — this doc is about *architecture*, not an
inventory.

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
