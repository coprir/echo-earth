-- Fix anonymous-visitor RLS (SUP-1 / SUP-2 in IMPLEMENTATION_PLAN.md).
--
-- The original policies (20261005230110_init.sql) use:
--   user_id = auth.uid() or user_id is null
-- "or user_id is null" was meant to let a not-yet-signed-in anonymous
-- visitor read/write their own row, but it doesn't actually scope to THEIR
-- row — it matches EVERY row with a null user_id, for ANY caller using the
-- anon key. Any anonymous visitor could read or overwrite any other
-- anonymous visitor's affinities/interactions/saved places.
--
-- The fix relies on Supabase Anonymous Sign-ins (a project Auth setting,
-- not something this migration can enable — see the REQUIRES HUMAN ACTION
-- note in docs/environment.md and IMPLEMENTATION_PLAN.md's SUP-1). Once
-- enabled, every visitor — anonymous or not — gets a real, non-null
-- auth.uid(), so a strict `user_id = auth.uid()` policy is both correct and
-- sufficient. No application code has ever written through the old,
-- insecure policy (verified: no @supabase/supabase-js usage anywhere in the
-- app before this project's current work), so there is no existing data to
-- migrate or reconcile.

-- Force user_id from the session's own auth.uid() — never trust a
-- client-supplied value, so a caller cannot insert/update a row claiming to
-- be someone else's visitor.
create or replace function set_visitor_user_id() returns trigger
language plpgsql security definer as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

create trigger visitors_set_user_id
  before insert or update on visitors
  for each row execute function set_visitor_user_id();

-- user_id is now always populated server-side (by the trigger above) from a
-- real session, anonymous or not — enforce that invariant at the schema
-- level so a null-user_id row (an insert attempted with no session at all)
-- fails loudly instead of silently becoming an unreadable orphan row.
alter table visitors alter column user_id set not null;

drop policy if exists "own visitor row" on visitors;
create policy "own visitor row" on visitors
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own affinities" on affinities;
create policy "own affinities" on affinities
  for all
  using (visitor_id in (select id from visitors where user_id = auth.uid()))
  with check (visitor_id in (select id from visitors where user_id = auth.uid()));

drop policy if exists "own interactions" on interactions;
create policy "own interactions" on interactions
  for all
  using (visitor_id in (select id from visitors where user_id = auth.uid()))
  with check (visitor_id in (select id from visitors where user_id = auth.uid()));

drop policy if exists "own saved places" on saved_places;
create policy "own saved places" on saved_places
  for all
  using (visitor_id in (select id from visitors where user_id = auth.uid()))
  with check (visitor_id in (select id from visitors where user_id = auth.uid()));
