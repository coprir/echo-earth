# ECHO EARTH — Release Checklist (Phase 11)

Generated 2026-10-19. This is a **release candidate checklist**, not a
release — nothing here authorizes an actual deployment, infrastructure
change, or paid-service activation. Every item is labeled:

- **READY** — verified this session, with evidence, in this document or a
  linked one.
- **BLOCKED** — cannot be completed without something outside this
  session's reach (a live service, Docker, real credentials, an account).
- **REQUIRES HUMAN ACTION** — the code/docs side is done; a person with
  the right access must do a specific, named thing before this is truly
  done.

No item is marked READY on source-code existence alone — each one states
what was actually run/verified and against what.

## Repository and branch

| | |
|---|---|
| Repository | this repo, local clone |
| Current branch | `claude-autonomous-development` |
| Recommended release branch | `main` (see "Git and stopping conditions" in `PROJECT_STATUS.md`'s Phase 11 update for the exact merge/PR recommendation — **not pushed or merged this session**) |
| Commit intended for release | see the Phase 11 commit hash in `PROJECT_STATUS.md`'s final update (this document is written before that commit, so it can't self-reference its own hash — check `git log -1 --oneline` after the Phase 11 commit lands) |

**STATUS: READY** — branch and working tree verified clean at the start
of this session (`git status` — nothing to commit; `git log` confirmed
HEAD matched the last recorded commit from Phase 10). No uncommitted work
was discarded.

## Build and test status

All four commands below were run fresh this session, from a clean `.next`
build directory (not reusing a stale cache), with `npm install` re-run
first to confirm reproducibility.

| Check | Result |
|---|---|
| `npm install` | Clean — 543 packages, 0 install errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run test` | **34 files / 181 tests, all passing** |
| `npm run build` | Clean, `/` statically rendered, First Load JS 119 kB/222 kB |
| `npm run start` (production server) | Started successfully, `Ready in ~900ms`, every route returned the expected status (see "Manual smoke tests" below) |
| `npx playwright test` against the **running production server** (not dev mode — confirmed by it reusing the already-listening `:3000` port, and by measurably faster execution: ~15s vs. the ~30s this same suite takes against `next dev`) | **8/8 passing** (5 spec files: RTL, reduced-motion, critical journey, mobile viewport, SEO metadata) |

**STATUS: READY**

## Environment variables

Full reference (purpose, exposure, required-for, where to configure):
`docs/environment.md`'s "Environment variable reference" table. Summary:
**7 variables total, all optional** — confirmed by grepping every
`process.env.*` reference in the source; nothing is read outside the
validated `lib/env.server.ts`/`lib/env.client.ts` schemas.

| Variable | Status |
|---|---|
| `GOOGLE_MAPS_API_KEY` | **READY** (optional) — code path verified this session with an invalid key: falls back to synthesized places, no crash, no leaked error detail |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **READY** (optional) — `LivingMap.tsx` returns `null` when unset, verified |
| `OPENWEATHER_API_KEY` | **READY** (optional) — verified this session with an invalid key: falls back to synthesized weather |
| `ANTHROPIC_API_KEY` | **BLOCKED** for live verification — never set in this project's history; architecture is complete and mock-tested (`docs/ai-concierge.md`), but the real `POST /v1/messages` call path has never executed |
| `NEXT_PUBLIC_SUPABASE_URL` | **BLOCKED** for live verification — no hosted project linked |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **BLOCKED** for live verification — same |
| `SUPABASE_SERVICE_ROLE_KEY` | **BLOCKED** for live verification — same; also, no application code calls the admin client yet regardless |

**App-level status: READY** — the application correctly builds, starts,
and serves its full demo experience with **zero** of these set (re
-verified this session). Each individual integration's *live* behavior
remains BLOCKED pending real credentials (see "External services" below).

## Database migrations

Three migrations, in `supabase/migrations/`, applied in timestamp order.
Full detail: `docs/deployment.md`'s "Migration prerequisites and order."

| Migration | Status |
|---|---|
| `20261005230110_init.sql` | **READY** to apply (no live dependency) |
| `20261005232553_fix_anonymous_visitor_rls.sql` | **REQUIRES HUMAN ACTION** first — depends on Anonymous Sign-ins being enabled in the Supabase dashboard (no migration/CLI can do this) |
| `20261019000000_presence_realtime_authorization.sql` | **REQUIRES HUMAN ACTION** — same prerequisite, plus its own manual verification step (confirm an authenticated session can join a presence channel, an unauthenticated one cannot) once applied |

**RLS correctness**: **BLOCKED** for live verification — hand-traced at
the SQL level (`SECURITY_AUDIT.md`'s "Supabase and access control"), never
executed against a real Postgres instance. Local Docker daemon confirmed
not running this session (`docker ps` fails with a connection error).

## Authentication setup

**REQUIRES HUMAN ACTION**: Supabase Anonymous Sign-ins must be enabled in
the target project's dashboard (Authentication → Sign In/Providers) before
either RLS-dependent migration above is applied. No code or CLI path can
do this. See `docs/environment.md`'s "REQUIRES HUMAN ACTION" section for
the full 3-step sequence.

## External service configuration

Full detail (per-service: depends-on, secure configuration, verification
steps, fallback, cost/quota, failure modes): `docs/deployment.md`'s
"External services" section. Summary status:

| Service | Code/fallback status | Live integration status |
|---|---|---|
| Google Maps/Places | **READY** — graceful fallback verified this session with an invalid key | **BLOCKED** — no valid key tested |
| OpenWeather | **READY** — same | **BLOCKED** — same |
| Anthropic | **READY** — fallback ladder fully mock-tested, documented in `docs/ai-concierge.md` | **BLOCKED** — never tested with a real key, ever |
| Supabase | **READY** — null-client no-op verified | **BLOCKED** — no project linked |

## Security findings

Full record: `SECURITY_AUDIT.md` (Phase 10). Headline items, re-confirmed
still current this session (`npm audit` re-run fresh):

| Finding | Status |
|---|---|
| `next` framework CVEs (previously CRITICAL) | **READY** — fixed (15.5.19 → 15.5.28), re-verified clean this session |
| `/api/concierge` payload size, `/api/geo` coordinate validation, baseline security headers | **READY** — fixed and tested in Phase 10, re-verified live against the production server this session (`curl -sI` confirms all four headers present) |
| Remaining `npm audit` findings (dev-tooling-only: ESLint/Vitest transitive chains) | **READY as-is** — deliberately not force-upgraded; reasoning in `SECURITY_AUDIT.md`'s dependency table, unchanged this session |
| Secrets-in-bundle leak check | **READY** — CI step exists, detection mechanism proven with a planted-then-removed fixture (Phase 10); **REQUIRES HUMAN ACTION** to confirm it runs on a real GitHub Actions execution (never has) |
| RLS live verification | **BLOCKED** — see "Database migrations" above |
| CSP | **not implemented** (documented, deliberate deferral — needs live browser testing against Google Maps' script loading) |

## Monitoring

**BLOCKED / not configured** — no error-reporting service, no uptime
monitor, no alerting exists. Structured JSON logs exist
(`lib/log.ts`, actively enforced to exclude secrets/PII/coordinates) and
are captured by any standard hosting platform's function logs natively.
Full operational guidance (what to look for, where): `docs/deployment.md`'s
"Monitoring and operational readiness" section. **REQUIRES HUMAN ACTION**
if synthetic uptime monitoring or error alerting is wanted — nothing to
configure in-repo beyond what exists; this is an external-service decision
for the project owner.

## Domain and hosting requirements

**Recommendation: Vercel** (evidence and reasoning in
`docs/deployment.md`'s "Hosting recommendation" section — the app's own
`/api/geo` route already assumes Vercel's edge headers as its first
-choice geolocation strategy). `README.md` references `echoearthh.com` as
the intended live domain; `app/layout.tsx`/`app/sitemap.ts`/`app/robots.ts`
all hardcode that URL — deploying elsewhere requires updating those three
files first. **REQUIRES HUMAN ACTION**: account/team access to provision
hosting and DNS — not available in this session, and not something this
session attempted.

## Backup and rollback plan

Full detail: `docs/deployment.md`'s "Backup requirements" and "Rollback
limitations" sections. Summary: application rollback (Vercel deployment
promotion) is fast and safe; **no migration in this repo has a
corresponding down-migration** — reverting migration 2 (the anonymous
-identity RLS fix) is explicitly **not recommended**, since it would
restore a documented, known-insecure policy. **REQUIRES HUMAN ACTION**
before the first production migration run against real data: take a
Supabase backup first.

## Manual smoke tests (performed this session, against the real production server)

| Test | Result |
|---|---|
| `GET /` | `200`, full HTML with correct title/metadata |
| `GET /api/geo` | `200`, `source: "fallback"` (no edge headers from a local curl — expected and correct) |
| `GET /api/weather?lat=...&lon=...` | `200`, `source: "echo"` (no key configured — expected) |
| `GET /api/places?lat=...&lon=...&category=cafes` | `200`, synthesized places, correct shape |
| `POST /api/concierge` with an empty body | `400`, `{"error":"invalid request"}` |
| `GET /robots.txt`, `GET /sitemap.xml` | `200`, correct content |
| `GET /opengraph-image`, `GET /twitter-image` | `200`, `image/png`, real 1200×630 PNGs |
| `GET /favicon.ico` | `200` |
| `GET /this-does-not-exist` | `404` |
| Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) | Present on both a page route and an API route |
| Invalid `GOOGLE_MAPS_API_KEY`/`OPENWEATHER_API_KEY` set | Both routes logged a coarse `error:status_*` server-side and fell back to synthesized data — no crash, no client-visible error, no secret in the log |
| Full Playwright suite against the running production server | 8/8 passing (see "Build and test status") |

**STATUS: READY**

## Unresolved issues

See `SECURITY_AUDIT.md`'s "Outstanding risks" for the full list
(per-process rate limiting, `x-forwarded-for` trust depending on hosting
topology, deferred dependency upgrades, no CSP, AI narrative/cache minor
data-quality nit, `useAdaptiveMind` persistence untested). Nothing on that
list is release-blocking for a demo-mode-first launch; several become
relevant specifically once live third-party traffic is flowing.

## Explicit release approval

**Not given.** This checklist documents readiness evidence; it does not
constitute approval to deploy, merge to a protected branch, or activate
any paid service. See the final response in this session's report for the
overall READY/NOT READY determination and exactly what's still needed.
