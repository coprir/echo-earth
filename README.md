# ◉ ECHO EARTH

**A living digital organism that discovers your city as it discovers you.**

Live home: [echoearthh.com](https://echoearthh.com)

ECHO EARTH senses your location, weather, season, time of day, device, battery,
network, motion and light preference — then grows a *neural map* of the places
around you: cafés, taverns, cocktail bars, hidden gems, beaches, clubs, petrol
stations and more, each pulsing as a neuron in its true compass direction.

No two visitors ever see the same organism. The palette drifts with a
per-visitor seed and mutates every few minutes. Rain grows rain; snow grows
frost; 2 a.m. grows neon.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

**It works with zero API keys** — demo mode synthesizes weather from your
latitude and season, and grows a deterministic "echo city" around your IP
location.

## Bring the real world in

Copy `.env.example` → `.env.local` and add any of:

| Key | Unlocks |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Real nearby places via Places API (New) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Mood-styled live map tiles under the neural field |
| `OPENWEATHER_API_KEY` | Live weather → live atmosphere |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Cross-device memory (run `supabase/schema.sql`) |

## What's inside

- **Adaptive environment engine** — [engine/environment.ts](engine/environment.ts) resolves 16 signals into a Theme (palette, particle weather, breath period, motion intensity, audio chord) applied as CSS variables.
- **Sensory system** — [engine/useEnvironment.ts](engine/useEnvironment.ts): geolocation (IP→GPS upgrade), weather, battery, network, device motion, scroll energy, reduced-motion, perf tier.
- **WebGL atmosphere** — [components/organism/ParticleField.tsx](components/organism/ParticleField.tsx): rain, snow, embers, fireflies, frost, dust — density scaled to your hardware.
- **Neural city map** — [components/map/NeuralMap.tsx](components/map/NeuralMap.tsx): places as breathing neurons connected by firing filaments.
- **Adaptive mind** — [engine/useAdaptiveMind.ts](engine/useAdaptiveMind.ts): learns your taste, detects walking vs driving, re-ranks categories.
- **Mood lenses** — Late Night · Rainy Day · Cheap Eats · Luxury · Hidden Gems.
- **Generative ambient audio** — [engine/audio.ts](engine/audio.ts): a synth chord per mood that responds to your touch (opt-in, ◎ button).
- **Survival mode** — battery < 15 % or save-data collapses the organism to a minimal, fast UI.

Full design document: [ARCHITECTURE.md](ARCHITECTURE.md) · Database: [supabase/schema.sql](supabase/schema.sql)
