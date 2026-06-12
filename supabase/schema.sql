-- ECHO EARTH — Supabase schema
-- The organism's long-term memory. The app is fully functional without this
-- (localStorage holds per-device memory); Supabase adds cross-device identity,
-- saved places, telemetry-driven evolution, and the AI suggestion cache.

create extension if not exists "uuid-ossp";

-- Anonymous-first visitors: a visitor row is created from the client seed,
-- upgradeable to a real auth.users link if they ever sign in.
create table if not exists visitors (
  id uuid primary key default uuid_generate_v4(),
  client_seed text unique not null,          -- localStorage seed, the organism's name for you
  user_id uuid references auth.users(id),    -- null until they sign in
  first_city text,
  last_city text,
  last_lat double precision,
  last_lon double precision,
  device_kind text check (device_kind in ('phone','tablet','desktop')),
  visits int not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Learned taste: one row per visitor per category, mirrors the client-side
-- affinity store so taste follows the visitor across devices.
create table if not exists affinities (
  visitor_id uuid references visitors(id) on delete cascade,
  category text not null,
  weight real not null default 0 check (weight between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (visitor_id, category)
);

-- Every meaningful touch: category picks, node opens, route handoffs.
-- Feeds both the recommendation cortex and the "evolves over time" behavior.
create table if not exists interactions (
  id bigint generated always as identity primary key,
  visitor_id uuid references visitors(id) on delete cascade,
  kind text not null check (kind in ('pick_category','open_place','route','mode_change','sound_on')),
  category text,
  place_ref text,                            -- google place id or echo id
  mood_mode text,
  travel_mode text,
  weather_kind text,
  time_phase text,
  created_at timestamptz not null default now()
);
create index if not exists interactions_visitor_time on interactions (visitor_id, created_at desc);

-- Saved / loved places
create table if not exists saved_places (
  visitor_id uuid references visitors(id) on delete cascade,
  place_ref text not null,
  name text not null,
  category text not null,
  lat double precision not null,
  lon double precision not null,
  saved_at timestamptz not null default now(),
  primary key (visitor_id, place_ref)
);

-- AI suggestion cache: the LLM layer writes mood-aware suggestions here so
-- repeated contexts are instant and cheap. Keyed by a context fingerprint.
create table if not exists ai_suggestions (
  id bigint generated always as identity primary key,
  context_hash text unique not null,         -- hash(city, phase, season, weather, mode)
  city text,
  payload jsonb not null,                    -- ranked categories + narrative whisper
  model text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

-- Aggregate city personalities: each city the organism meets develops a
-- statistical "taste" that seeds defaults for new visitors there.
create table if not exists city_moods (
  city text primary key,
  country text,
  top_categories jsonb not null default '[]',
  visit_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS: visitors only see their own memory.
alter table visitors enable row level security;
alter table affinities enable row level security;
alter table interactions enable row level security;
alter table saved_places enable row level security;

create policy "own visitor row" on visitors
  for all using (user_id = auth.uid() or user_id is null);
create policy "own affinities" on affinities
  for all using (visitor_id in (select id from visitors where user_id = auth.uid() or user_id is null));
create policy "own interactions" on interactions
  for all using (visitor_id in (select id from visitors where user_id = auth.uid() or user_id is null));
create policy "own saved places" on saved_places
  for all using (visitor_id in (select id from visitors where user_id = auth.uid() or user_id is null));

-- ai_suggestions and city_moods are server-written (service role), public-read.
alter table ai_suggestions enable row level security;
alter table city_moods enable row level security;
create policy "read suggestions" on ai_suggestions for select using (true);
create policy "read city moods" on city_moods for select using (true);
