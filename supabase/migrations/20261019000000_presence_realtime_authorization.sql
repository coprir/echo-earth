-- Realtime Authorization for explorer presence (RTP-1/2 in
-- IMPLEMENTATION_PLAN.md; full privacy threat model in
-- docs/realtime-presence.md).
--
-- No new table. Presence state for this feature is intentionally ephemeral
-- and lives only inside Supabase Realtime's own in-memory presence tracker
-- (engine/usePresence.ts), never persisted to Postgres — there is nothing
-- here for a migration to create, index, or back up. What *does* need a
-- migration is authorization: by default, a Realtime channel accepts any
-- connection holding the public anon key, with no server-side check at all.
-- This migration turns that off for presence channels specifically, via
-- Supabase's Realtime Authorization feature (RLS on the special
-- `realtime.messages` relation), and requires the connecting client to hold
-- a real Supabase session — anonymous sign-in (already required by
-- engine/useSupabaseSession.ts for every other Supabase-backed feature)
-- counts; a request with no session at all does not.
--
-- Client-side half of this contract: engine/usePresence.ts always creates
-- its channel with `config: { private: true }`, which is what makes
-- supabase-js actually submit to these policies instead of using the
-- legacy/public (unauthenticated) channel path.
--
-- REQUIRES HUMAN ACTION — same shape as the anonymous-identity migration
-- (supabase/migrations/20261005232553_fix_anonymous_visitor_rls.sql):
--   1. Apply this migration against a real, linked Supabase project
--      (`supabase db push` / `supabase migration up`), the same way as the
--      existing migrations.
--   2. Anonymous Sign-ins must already be enabled (docs/environment.md) —
--      presence reuses that identity, it doesn't need a separate toggle.
--   3. Verify live: open two authenticated sessions in the same city
--      bucket and confirm each sees the other's presence; then confirm an
--      unauthenticated `supabase-js` client (no session) is rejected when
--      it tries to subscribe to a `presence:city:*` topic with
--      `private: true`.
-- None of this has been run against a live project in this sandbox — no
-- hosted Supabase project is linked here, and the local Docker daemon
-- needed for `supabase start` isn't running (see PROJECT_STATUS.md). This
-- migration is implemented and reviewed, not live-verified.

alter table realtime.messages enable row level security;

-- Any authenticated connection (anonymous sign-in included — the `sub`
-- claim/`auth.uid()` just needs to be non-null) may listen to presence
-- channels. Scoped to the `presence:` topic prefix this feature uses, so a
-- policy bug here can't accidentally authorize access to some unrelated
-- future Realtime channel.
create policy "authenticated can read presence channels"
on "realtime"."messages"
for select
to authenticated
using ( realtime.topic() like 'presence:city:%' );

-- Tracking presence (what engine/usePresence.ts's `channel.track()` call
-- does under the hood) is implemented as a broadcast-like write against
-- this same relation — needs its own policy, same scope and same
-- authenticated-only requirement.
create policy "authenticated can broadcast presence channels"
on "realtime"."messages"
for insert
to authenticated
with check ( realtime.topic() like 'presence:city:%' );

-- Explicitly no policy for the `anon` role: an unauthenticated connection
-- (no session at all) is rejected outright on a private channel, which is
-- the intended behavior — see engine/usePresence.ts's own session check,
-- which is defense-in-depth for this, not the only enforcement.
