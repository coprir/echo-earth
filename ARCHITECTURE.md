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
                         │                                         │
                         │  engine/useAdaptiveMind (memory)        │
                         │  zustand + localStorage persistence     │
                         └───────┬───────────────┬─────────────────┘
                                 │               │
                    ┌────────────▼──┐     ┌──────▼──────────┐
                    │ /api/geo      │     │ /api/places     │
                    │ /api/weather  │     │ Google Places   │
                    │ edge runtime  │     │ (New) or echo   │
                    └───────────────┘     │ synthesis       │
                                          └──────┬──────────┘
                                  ┌──────────────▼─────────────┐
                                  │ Supabase (optional)        │
                                  │ visitors · affinities ·    │
                                  │ interactions · saved ·     │
                                  │ ai_suggestions · city_moods│
                                  └────────────────────────────┘
```

## 2. Folder structure

```
echo-earth/
├── app/
│   ├── layout.tsx              # fonts, metadata, viewport
│   ├── page.tsx                # the organism's body — orchestrates everything
│   ├── globals.css             # CSS-variable theme surface, breath, glass
│   └── api/
│       ├── geo/route.ts        # IP geolocation (edge headers → ipapi → fallback)
│       ├── weather/route.ts    # OpenWeather proxy + seasonal synthesis fallback
│       └── places/route.ts     # Google Places (New) + echo demo-city fallback
├── engine/                     # the organism itself — no UI in here
│   ├── environment.ts          # genome: EnvSignals → Theme (pure functions)
│   ├── useEnvironment.ts       # nervous system: all browser sensors → signals
│   ├── useAdaptiveMind.ts      # memory: affinities, mood mode, travel mode
│   └── audio.ts                # generative ambient synth (WebAudio)
├── components/
│   ├── organism/
│   │   ├── Awakening.tsx       # boot ritual / landing sequence
│   │   └── ParticleField.tsx   # WebGL atmosphere (rain/snow/embers/fireflies)
│   ├── map/
│   │   ├── NeuralMap.tsx       # canvas neural city — the core visualization
│   │   └── LivingMap.tsx       # optional Google tiles substrate
│   ├── discovery/
│   │   ├── CategoryOrbs.tsx    # self-reordering category strand
│   │   ├── MoodModes.tsx       # late night / rainy day / cheap eats / luxury / gems
│   │   └── PlaceDetail.tsx     # glass membrane with route handoff
│   └── hud/VitalsHUD.tsx       # what the organism senses + sound toggle
├── lib/
│   ├── places.ts               # category genome, Place type, demo synthesis
│   └── recommend.ts            # recommendation cortex (ranking + whispers)
└── supabase/schema.sql         # long-term memory schema
```

## 3. The adaptive environment engine

**Signals collected** (`useEnvironment`): clock (time phase, season per hemisphere),
GPS→IP location chain, weather (live or synthesized), device class + touch,
screen size, battery level + saver, network effective speed, `prefers-color-scheme`,
`prefers-reduced-motion`, hardware perf tier (cores + memory), motion energy
(scroll velocity + pointer speed + accelerometer), a stable per-visitor seed,
and a mutation tick that advances every 3 minutes.

**Resolution** (`resolveTheme`): a personality table maps *weather × phase × season*
to a mood (Frostform, Rainmind, Neon Drift, Emberfall, Goldenform…). Each mood's
hues are then *drifted* by the visitor seed and mutation tick — so the palette is
never identical between two visitors or two hours. The mood also selects the
particle weather, breath period, glass blur, motion intensity, and audio chord.

**Application**: the theme lands as CSS variables on `<html>`. Every component —
glass panels, glows, text, scrollbars — reads variables, so a single resolution
re-skins the entire organism with a 2.4 s cross-fade. No component knows about
weather; they only know the variables breathe.

**Degradation ladder**: high tier → full particles + 18 px glass; mid/low → scaled
density; battery < 15 % or save-data → Survival Mode (no WebGL, slow breath,
minimal blur); `prefers-reduced-motion` → all animation amplitude to zero.
Every sensor is optional — a missing API degrades, never crashes.

## 4. Discovery engine

- `/api/places` calls **Google Places API (New) `searchNearby`** with per-category
  `includedTypes`, field-masked to exactly what the UI needs, cached 5 min.
- **Hidden gem detection**: rating ≥ 4.5 with 5–200 reviews.
- **Demo mode**: without a key, `synthesizePlaces` grows a deterministic city
  (seeded by lat/lon grid cell) so the experience is fully explorable offline.
- Results carry `distanceM` + `bearing`, which the NeuralMap uses to place
  neurons in their *true real-world direction* around the visitor-nucleus.

## 5. Adaptive intelligence

- `useAdaptiveMind` (zustand + localStorage): affinities per category grow on
  every touch and decay multiplicatively, so taste is recent-weighted.
- `watchTravelMode` reads GPS speed → still / walking / driving.
- `rankCategories` scores: mood mode > travel context (driving → petrol & quick
  food; walking → cafés & social) > time phase > weather > learned favorites.
  The orb strand visibly re-sequences (Framer Motion `layout`) when context shifts.
- `filterPlaces` applies the mode lens (open-now, price caps, gems-only) but
  never returns an empty city.
- The LLM layer (optional): an edge function fingerprints context
  (city+phase+season+weather+mode), checks `ai_suggestions`, and on miss asks
  Claude for a ranked narrative — cached 6 h so cost stays near zero.

## 6. Motion design system

- **The breath** — one global `--ee-breath` period; every organic element
  inherits it (`.ee-breathe`), so the whole page inhales together. Late night
  slows the breath to 9 s; survival mode to 12 s.
- **Birth, not render** — places stagger into existence (90 ms apart) and
  grow from radius 0; nothing pops.
- **Liquid field** — neurons perpetually drift on sine wander, lean toward the
  pointer, and connect through quadratic filaments carrying firing pulses.
- **Cinematic cuts** — Awakening exits with scale+blur; thoughts cross-fade
  through blur; the detail membrane springs (stiffness 260, damping 26).
- **60 fps discipline** — canvas/WebGL for everything dense (no DOM particle
  hacks), DPR clamped at 1.5–2, additive blending, dt clamped, one rAF per layer.

## 7. Backend & data

Stateless API routes (deployable to Vercel edge) + optional Supabase
(`supabase/schema.sql`): anonymous-first `visitors` keyed by the client seed,
`affinities` mirroring client taste cross-device, `interactions` telemetry that
feeds evolution, `saved_places`, the `ai_suggestions` cache, and `city_moods` —
aggregate per-city taste that seeds defaults for newcomers, giving each city
its own personality. RLS keeps every visitor's memory private.

Realtime location streaming: Supabase Realtime channel per city slug —
presence updates make other explorers appear as faint anonymous sparks
(planned next phase; schema already supports it).

## 8. UX flow

1. **Awakening (0–6 s)** — black; an eye of light dilates; the organism reports
   what it senses ("a presence near Nairobi · rain · night · mood forming:
   rainmind"); the veil dissolves with blur+scale.
2. **The field** — the visitor is the nucleus; the city's places orbit as
   pulsing neurons in their true compass directions; a sonar ring sweeps.
3. **Touch** — a neuron swells, the glass membrane unfolds: rating, distance,
   price, open-state, *Route me there* (Google Maps directions handoff).
4. **Re-tuning** — mood lenses re-filter the field; the orb strand reorders;
   the whisper line narrates why ("you're moving fast — fuel is lit up").
5. **Return visits** — the seed remembers; favorite categories rise; the
   palette has drifted; the organism is never the same twice.

## 9. Accessibility despite the spectacle

ARIA roles on every control (radiogroup for modes, pressed states on orbs),
canvas labeled as `role="img"`, full `prefers-reduced-motion` shutdown,
text contrast pinned to ≥ 90 % lightness variables, all interactions reachable
without the canvas (orbs + detail panel are plain buttons/links).
