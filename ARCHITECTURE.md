# ECHO EARTH — Architecture

> A living AI city organism that emotionally adapts itself to every human entering it.

## 1. System overview

```
                         ┌─────────────────────────────────────────┐
                         │                BROWSER                  │
                         │                                         │
  senses ───────────────►│  engine/useEnvironment  (nervous system)│
  geolocation, weather,  │        │ EnvSignals                     │
  battery, network,      │        ▼                                │
  motion, light, scroll  │  engine/environment.resolveTheme        │
                         │        │ Theme (palette, particles,     │
                         │        │  breath, motion, audio mood)   │
                         │        ▼                                │
                         │  CSS variables ──► every component      │
                         │  ParticleField (R3F/WebGL atmosphere)   │
                         │  NeuralMap (canvas neural city)         │
                         │  LivingMap (Google tiles substrate)     │
                         │  ambient (WebAudio generative synth)    │
                         │  Consciousness (translated narrator)    │
                         │                                         │
                         │  engine/useAdaptiveMind (memory)        │
                         │  zustand + localStorage persistence     │
                         │  lib/i18n (9-language store, RTL)       │
                         └───────┬───────────────┬─────────────────┘
                                 │               │
                    ┌────────────▼──┐     ┌──────▼──────────┐
                    │ /api/geo      │     │ /api/places     │
                    │ /api/weather  │     │ Google Places   │
                    │ edge runtime  │     │ (New) or echo   │
                    └───────────────┘     │ synthesis       │
                                          └──────┬──────────┘
                                  ┌──────────────▼─────────────┐
                                  │ Supabase (not yet wired in)│
                                  │ schema tracked as migrations│
                                  │ visitors · affinities ·    │
                                  │ interactions · saved ·     │
                                  │ ai_suggestions · city_moods│
                                  └────────────────────────────┘
```

## 2. Folder structure

```
echo-earth/
├── app/
│   ├── layout.tsx              # fonts, metadata, viewport, root error boundary
│   ├── page.tsx                # the organism's body — orchestrates everything
│   ├── globals.css             # CSS-variable theme surface, breath, glass
│   ├── sitemap.ts               # single canonical-entry-point sitemap
│   ├── robots.ts                # crawl rules (disallow /api/)
│   └── api/
│       ├── geo/route.ts        # IP geolocation (edge headers → ipapi → fallback)
│       ├── weather/route.ts    # OpenWeather proxy + seasonal synthesis fallback
│       ├── places/route.ts     # Google Places (New) + echo demo-city fallback
│       └── concierge/route.ts  # AI concierge completion — see §5
├── engine/                     # the organism itself — no UI in here
│   ├── environment.ts          # genome: EnvSignals → Theme (pure functions)
│   ├── useEnvironment.ts       # nervous system: all browser sensors → signals
│   ├── useAdaptiveMind.ts      # memory: affinities, mood mode, travel mode
│   └── audio.ts                # generative ambient synth (WebAudio), visibility-aware
├── components/
│   ├── organism/
│   │   ├── ParticleField.tsx   # WebGL atmosphere (rain/snow/embers/fireflies)
│   │   └── Consciousness.tsx   # the translated narrator — see §5
│   ├── planet/
│   │   ├── PlanetaryEntry.tsx  # the boot sequence: holographic 3D Earth → dive-in
│   │   └── LivingEarth.tsx     # the 3D planet mesh PlanetaryEntry renders
│   ├── map/
│   │   ├── NeuralMap.tsx       # canvas neural city — the core visualization
│   │   └── LivingMap.tsx       # optional Google tiles substrate
│   ├── discovery/
│   │   ├── CategoryOrbs.tsx    # self-reordering category strand
│   │   ├── MoodModes.tsx       # late night / rainy day / cheap eats / luxury / gems
│   │   ├── AtmospherePicker.tsx# synthetic "digital weather" atmosphere selector
│   │   └── PlaceDetail.tsx     # glass membrane with route handoff
│   ├── concierge/
│   │   └── Concierge.tsx       # deterministic journey + best-effort AI upgrade — see §5
│   ├── about/
│   │   └── About.tsx           # "what is this?" intro panel
│   ├── i18n/
│   │   ├── LanguageGate.tsx    # first-run language picker (9 languages)
│   │   └── LangSwitcher.tsx    # in-app language switcher
│   └── hud/
│       ├── VitalsHUD.tsx       # what the organism senses
│       └── HudMenu.tsx         # consolidated ⋯ dropdown (about, sound, language)
├── lib/
│   ├── places.ts               # category genome, Place type, demo synthesis
│   ├── recommend.ts            # recommendation cortex (ranking + whispers)
│   ├── itinerary.ts            # concierge journey templates + composeJourney
│   ├── i18n.ts                 # 9-language dictionary store, RTL, auto-detect
│   ├── env.server.ts           # validated server-only env (server-only guarded)
│   ├── env.client.ts           # validated NEXT_PUBLIC_* env
│   ├── log.ts                  # structured server logging (PII-field guard)
│   ├── rateLimit.ts            # in-memory per-IP rate limiter (all API routes)
│   ├── fetchWithTimeout.ts     # shared outbound-fetch timeout wrapper
│   ├── supabase/
│   │   ├── client.ts           # browser Supabase client (anon key, RLS-enforced)
│   │   └── server.ts           # service-role Supabase client (server-only guarded)
│   └── ai/                     # AI concierge layer — see §5
│       ├── types.ts            # zod request/response contracts (shared, not secret)
│       ├── buildContext.ts     # deterministic candidate filtering (pure)
│       ├── anthropic.ts        # the only module importing @anthropic-ai/sdk
│       ├── validate.ts         # anti-hallucination place-id gate
│       └── cache.ts            # in-memory AI-response cache (20min TTL)
├── components/ErrorBoundary.tsx# generic error boundary, wraps WebGL/map/concierge
├── scripts/
│   ├── i18n-report.ts          # pure translation-completeness logic
│   └── check-i18n.ts           # CLI entry (npm run i18n:check)
├── supabase/
│   ├── migrations/             # tracked schema migrations (supabase CLI)
│   └── schema.sql              # pointer only — see migrations/ for the real schema
├── docs/
│   └── environment.md          # env validation layers + dev/preview/prod separation
├── vitest.config.ts            # two projects (node / jsdom) — see file comments
├── playwright.config.ts
└── IMPLEMENTATION_PLAN.md       # the living roadmap this doc is kept in sync with
```

## 3. The adaptive environment engine

**Signals collected** (`useEnvironment`): clock (time phase, season per hemisphere),
GPS→IP location chain, weather (live or synthesized), device class + touch,
screen size, battery level + saver, network effective speed, `prefers-color-scheme`,
`prefers-reduced-motion`, motion energy (scroll velocity + pointer speed +
accelerometer), a stable per-visitor seed, and a mutation tick that advances
every 3 minutes.

**Resolution** (`resolveTheme`): a personality table maps *weather × phase × season*
to a mood (Frostform, Rainmind, Neon Drift, Emberfall, Goldenform…). Each mood's
hues are then *drifted* by the visitor seed and mutation tick — so the palette is
never identical between two visitors or two hours. The mood also selects the
particle weather, breath period, glass blur, motion intensity, and audio chord.

**Application**: the theme lands as CSS variables on `<html>`. Every component —
glass panels, glows, text, scrollbars — reads variables, so a single resolution
re-skins the entire organism with a 2.4 s cross-fade. No component knows about
weather; they only know the variables breathe.

**Degradation ladder.** Battery < 15% or save-data correctly triggers Survival
Mode (no WebGL particles, slow breath, minimal blur, `tier: "survival"`), and
`prefers-reduced-motion` correctly zeroes animation amplitude. `useEnvironment`
still computes a real hardware-capability signal (`perfTier`, from
`navigator.hardwareConcurrency`/`deviceMemory`), but `resolveTheme` in
`engine/environment.ts` **deliberately does not use it** to scale particle
density below "high" — a documented product decision (see the comment at
`engine/environment.ts`'s `tier` computation): "the interface renders
identically on every device... richness is NOT scaled by device performance
tier," only Survival Mode and `prefers-reduced-motion` reduce it. This is a
real tradeoff (lower-end devices get the full particle count) worth revisiting
with real device profiling data — tracked as `PRF-1` in
`IMPLEMENTATION_PLAN.md` — but it is an intentional choice already made once,
not an unnoticed bug; changing it is a product decision, not a pure fix.

## 4. Discovery engine

- `/api/places` calls **Google Places API (New) `searchNearby`** with per-category
  `includedTypes`, field-masked to exactly what the UI needs, cached 5 min.
- **Hidden gem detection**: rating ≥ 4.5 with 5–200 reviews.
- **Demo mode**: without a key, `synthesizePlaces` grows a deterministic city
  (seeded by lat/lon grid cell) so the experience is fully explorable offline.
  Every `Place` carries `source: "google" | "echo"`, and the UI surfaces this
  distinction directly (the HUD/map label reads "demo city · no API key" in
  echo mode) — synthetic data is never presented as if it were real.
- Results carry `distanceM` + `bearing`, which the NeuralMap uses to place
  neurons in their *true real-world direction* around the visitor-nucleus.

## 5. The concierge (hybrid deterministic + AI) and the narrator (deterministic)

**Narrator — deterministic, unchanged.**
`components/organism/Consciousness.tsx` (the ambient narrator voice) is a
weighted, seed-jittered candidate picker over translation keys (`nar.*`,
`atmo.*.whisper`, `phase.*`, `weather.*`) — fully routed through `useT()`, so
it speaks correctly in all 9 supported languages. It runs continuously (every
idle tick / context change) and is deliberately kept deterministic and
offline — an LLM call at that frequency would be slower, costlier, and not
actually better than the already-tuned phrase banks (see `CNS-1` in
IMPLEMENTATION_PLAN.md for the full reasoning).

An earlier, unused draft of the narrator (`engine/consciousness.ts`, English
-only phrase banks, never imported by the live app) and an unused earlier
boot sequence (`components/organism/Awakening.tsx`, superseded by
`PlanetaryEntry.tsx`) have been removed — see git history around commit
`5204133` and later for the cleanup.

**Concierge — hybrid, deterministic-first.** `components/concierge/Concierge.tsx`
always composes a movement journey via `lib/itinerary.ts`'s `composeJourney` —
a pure, deterministic function that picks the best real place per template
step — and renders it immediately, with zero added latency versus before. It
then calls `POST /api/concierge` as a best-effort, time-boxed (~6.5s)
*upgrade*: if a validated AI response arrives in time, the displayed journey's
order and narration are replaced with the model's; if it doesn't (missing key,
timeout, network error, invalid response), the deterministic journey already
on screen is left exactly as it was. A "✦ AI-refined" label (translated into
all 9 languages) appears only when a response genuinely came from the model.

The AI layer (`lib/ai/`) never invents places — it only ever reasons over and
narrates a candidate set the client already fetched from the real data layer
(Google Places or echo synthesis):

```
places already fetched (real or echo)
        │
        ▼
lib/ai/buildContext.ts    — dedupe, cap (≤24), sort by rating/distance;
                             trims to exactly the fields the model needs
        │
        ▼
lib/ai/types.ts           — zod-validated request/response contract
        │
        ▼
app/api/concierge/route.ts — rate-limited (10/min/IP), input-validated,
                              checks lib/ai/cache.ts (in-memory, 20min TTL,
                              keyed by non-personal context only) before
                              calling the model
        │
        ▼
lib/ai/anthropic.ts        — the only module that imports @anthropic-ai/sdk;
                              client.messages.parse() + zodOutputFormat() —
                              structured output, not free-text parsing
        │
        ▼
lib/ai/validate.ts          — the anti-hallucination gate: every returned
                               place id is checked against the real candidate
                               set; anything else is dropped; empty result ⇒
                               treated identically to "no AI response"
        │
        ▼
Concierge.tsx merges by id against its own already-fetched places — never
trusts any place data from the AI response beyond the id + narrative text
```

**Architecture implemented vs. service live:** this entire pipeline is built
and tested with the Anthropic SDK mocked at the `lib/ai/anthropic.ts`
boundary — no test requires or uses a real API key. Whether it behaves this
way against the *real* Anthropic API is unverified in this environment, since
`ANTHROPIC_API_KEY` has never been set here — see `PROJECT_STATUS.md`'s Phase
5 update for the precise distinction and what verifying it would require.

## 6. Adaptive intelligence (recommendation ranking)

- `useAdaptiveMind` (zustand + localStorage): affinities per category grow on
  every touch and decay multiplicatively, so taste is recent-weighted. Local
  -only today — not yet synced to Supabase (`SUP-3`, still pending).
- `watchTravelMode` reads GPS speed → still / walking / driving.
- **`lib/recommend.ts` is the single shared ranking engine** behind every
  "which places matter right now" decision — the main field's visible
  places, the Concierge's deterministic journey, and the AI context
  builder's candidate ordering all call it, rather than each hand-rolling
  its own heuristic (which was the case before this engine was unified —
  see `docs/recommendation-engine.md` for the full before/after and the
  scoring table):
  - `rankCategories` scores *categories* for the orb strand: mood mode >
    travel context > time phase > weather > learned favorites. The orb
    strand visibly re-sequences (Framer Motion `layout`) when context shifts.
  - `filterPlaces` applies the mode lens (open-now, price caps, gems-only) to
    individual *places* but never returns an empty city.
  - `scorePlace`/`rankPlaces` score and order individual places: the same
    category-context weights as `rankCategories`, plus rating, distance
    (closer wins), a gem bonus, an open-now bonus, and mode-conditional price
    fit (luxury rewards higher price, cheapeats rewards lower).
  - `buildValidCandidates` composes the two (filter, then rank) as the one
    call site everything above uses. It's generic over any place-shaped
    object with the scoring fields, so the AI layer's trimmed
    `ConciergeCandidate` type shares the exact same ranking as the full
    `Place` type used elsewhere — no second, drifting heuristic.

## 7. Multilingual system

`lib/i18n.ts` supports **9 languages** (English, Arabic, French, Mandarin,
Spanish, Russian, Greek, Turkish, German) — not 8; earlier docs undercounted
this. Verified complete via `scripts/check-i18n.ts` (`npm run i18n:check`):
every key present in the English source-of-truth dictionary exists in all 8
other languages, including the narrator (`nar.*`), journey (`journey.*`), and
atmosphere (`atmo.*`) namespaces. Language is auto-selected from IP country
(falling back to browser language, then English), persists across sessions,
and can be overridden manually via `HudMenu`/`LangSwitcher`. Arabic switches
the document to RTL.

## 8. Motion design system

- **The breath** — one global `--ee-breath` period; every organic element
  inherits it (`.ee-breathe`), so the whole page inhales together. Late night
  slows the breath to 9 s; survival mode to 12 s.
- **Birth, not render** — places stagger into existence (90 ms apart) and
  grow from radius 0; nothing pops.
- **Liquid field** — neurons perpetually drift on sine wander, lean toward the
  pointer, and connect through quadratic filaments carrying firing pulses.
- **Cinematic cuts** — `PlanetaryEntry` exits with scale+blur into the field;
  the narrator's thoughts cross-fade through blur; the detail membrane springs
  (stiffness 260, damping 26).
- **60 fps discipline** — canvas/WebGL for everything dense (no DOM particle
  hacks), DPR clamped at 1.5–2, additive blending, dt clamped, one rAF per layer.

## 9. Backend & data

Stateless API routes (deployable to Vercel edge). Supabase is **schema-only
today** — `supabase/migrations/` holds a tracked, CLI-managed migration
(moved verbatim from the former hand-run `supabase/schema.sql`) describing
anonymous-first `visitors`, `affinities`, `interactions`, `saved_places`, the
`ai_suggestions` cache, and `city_moods`, but **no application code reads or
writes any of these tables yet** (confirmed: no `@supabase/supabase-js` usage
outside the new `lib/supabase/client.ts`/`server.ts` factories, which exist
but aren't called from any page/route yet). `lib/env.server.ts`/
`lib/supabase/server.ts` are guarded with `server-only` so
`SUPABASE_SERVICE_ROLE_KEY` can never reach the browser bundle — see
`docs/environment.md`. The known RLS gap in the current migration
(`user_id = auth.uid() or user_id is null`, which doesn't correctly scope
anonymous visitors from each other) is tracked, not yet fixed — see `SUP-1`/
`SUP-2` in `IMPLEMENTATION_PLAN.md` before wiring any real traffic through it.

Realtime location streaming: Supabase Realtime channel per city slug —
presence updates make other explorers appear as faint anonymous sparks
(planned; not implemented — see `IMPLEMENTATION_PLAN.md` Phase RTP for the
privacy-preserving design this requires before implementation).

## 10. UX flow

1. **Language gate** — first-run visitors choose from 9 languages before
   anything else loads; returning visitors skip straight past it.
2. **Planetary entry (`PlanetaryEntry`)** — a holographic 3D Earth locates the
   visitor, then dives into their city; the veil dissolves with blur+scale.
3. **The field** — the visitor is the nucleus; the city's places orbit as
   pulsing neurons in their true compass directions; a sonar ring sweeps.
4. **Touch** — a neuron swells, the glass membrane unfolds: rating, distance,
   price, open-state, *Route me there* (Google Maps directions handoff).
5. **Re-tuning** — mood lenses re-filter the field; the orb strand reorders;
   the narrator line narrates why ("you're moving fast — fuel is lit up").
6. **Return visits** — the seed remembers; favorite categories rise; the
   palette has drifted; the organism is never the same twice.

## 11. Testing & environment architecture

See `docs/environment.md` for the env-validation layers and the
`server-only`/client-boundary enforcement mechanism, and `vitest.config.ts`'s
inline comments for why tests are split into a "node" and a "jsdom" Vitest
project (not cosmetic — it's how `server-only`'s client-import guard is both
exercised and worked around for legitimate server-side logic tests).

22 test files / 94 tests as of Phase 6 (`npm test`), covering: env/Supabase
client-boundary guards, the rate limiter and fetch-timeout utilities, the i18n
completeness checker, the AudioContext visibility lifecycle, error boundaries,
the anonymous-session hook, the full AI concierge pipeline (context building,
candidate capping, schema validation, the anti-hallucination gate, caching,
rate limiting, and prompt-injection resistance — all against a mocked
Anthropic boundary, no real API key used anywhere in the suite), and the
recommendation engine (category/place scoring golden cases, filter/rank
composition, and the journey composer — both had zero coverage before Phase 6).

## 12. Accessibility despite the spectacle

ARIA roles on every control (radiogroup for modes, `menuitemcheckbox` with
`aria-checked` for the sound toggle, `menuitemradio` for language options),
canvas labeled as `role="img"`, full `prefers-reduced-motion` shutdown,
text contrast pinned to ≥ 90 % lightness variables, all interactions reachable
without the canvas (orbs + detail panel are plain buttons/links).
