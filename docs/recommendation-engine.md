# Recommendation engine

How ECHO EARTH decides which categories and places to surface. This is the
"deterministic recommendation pipeline" the AI Concierge (`lib/ai/`) sits on
top of — per the ground rule for Phase 6, the AI layer must not become the
primary intelligence until this pipeline is strong on its own, and every
consumer below works correctly with `ANTHROPIC_API_KEY` unset.

## Before this phase: three independent, duplicated heuristics

A repo-wide trace (not an assumption — each file was re-read before any
change) found the "which place is best" decision implemented three separate
times, each slightly differently, none sharing logic:

1. **`lib/recommend.ts`'s `rankCategories`** scored *categories* (mode, travel,
   phase, weather, learned favorites) for the orb strand — but never scored
   individual *places*.
2. **`lib/recommend.ts`'s `filterPlaces`** only hard-filtered by mode
   (open-now / price / rating / gem) — its one `.sort()` (luxury mode) was by
   rating alone. The main field's visible places (`app/page.tsx`) were never
   re-ranked by rating, distance quality, or learned taste at all — just
   whatever order the API returned (raw distance order from Google/echo
   synthesis) with the mode filter applied on top.
3. **`lib/itinerary.ts`'s `composeJourney`** (the Concierge's deterministic
   journey) had its own inline sort — `rating desc, distance asc` — and never
   applied `filterPlaces`'s mode constraints at all, and never saw travel/
   phase/weather/favorites context, even though every energy maps to a
   `MoodMode` that should have applied exactly those constraints.
4. **`lib/ai/buildContext.ts`'s candidate ordering** (built in Phase 5) was a
   *fourth*, independently-written copy of the same `rating desc, distance
   asc` heuristic, sent to the AI model — meaning the model could see
   candidates in a different priority order than the UI would ever show them.

None of this had test coverage (`lib/recommend.ts` and `lib/itinerary.ts` both
had zero tests before this phase).

## The unified pipeline (after this phase)

```
                    USER
                     │
              USER SIGNALS ─── mind.favorites() (learned affinities),
                     │         mind.mode (mood lens), current energy request
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  Preferences   Interactions   Current request
  (affinities)  (mode/travel)  (category / energy)
                     │
              ENVIRONMENT ──── theme.phase, env.weather.kind, mind.travel
                     │
                PLACE DATA ──── /api/places (Google or echo), already
                     │          fetched by the caller
                     ▼
         lib/recommend.ts: filterPlaces()   ← HARD FILTERING
           (mode-conditional hard constraints; never empties a non-empty set)
                     │
                     ▼
         lib/recommend.ts: rankPlaces()     ← RANKING ENGINE
           (scorePlace: category-context + rating + distance + gem + open +
            price-fit, one shared formula)
                     │
                     ▼
            VALID CANDIDATES (buildValidCandidates = filter ∘ rank)
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   Deterministic UI        AI Context Builder
   (app/page.tsx's          (lib/ai/buildContext.ts —
    visiblePlaces,           now calls the SAME rankPlaces,
    lib/itinerary.ts's       not a 4th heuristic)
    composeJourney)                │
          │                        ▼
          │                 AI Concierge (optional, best-effort upgrade)
          │                        │
          └───────────┬────────────┘
                       ▼
                FINAL RESPONSE (journey / visible places)
                       │
                       ▼
                     USER
                       │
                       ▼
                   FEEDBACK ── category picks, place opens → noticeCategory()
                       │
                       ▼
                USER MEMORY (engine/useAdaptiveMind — local today; Supabase
                              sync tracked separately, see SUP-3 in
                              IMPLEMENTATION_PLAN.md — not yet wired to any
                              table)
```

`buildValidCandidates<T extends ScorablePlace>(places, ctx)` is the single
shared entry point — generic over anything with the scoring fields
(`category`, `rating`, `priceLevel`, `openNow`, `distanceM`, `isGem`), so it
works identically for the full `Place` type (main field, Concierge) and the
AI layer's trimmed `ConciergeCandidate` type, with no duplicate logic.

## The scoring model

`categoryContextScores(ctx)` — shared by `rankCategories` (category order) and
`scorePlace` (place score's category-context term) — applies these rules
(exact weights preserved from the original `rankCategories`, now named and
shared instead of duplicated):

| Signal | Rule | Base | Per-position step |
|---|---|---|---|
| Mood mode | each mode's associated categories (e.g. `latenight` → clubs, cocktails, fastfood, taverns, petrol, pharmacies) | 100 | −8 |
| Travel: driving | petrol, fastfood, hotels | 60 | −10 |
| Travel: walking | cafes, taverns, gems, scenic | 40 | −6 |
| Phase: late-night/night | clubs, cocktails, fastfood | 30 | −5 |
| Phase: dawn/day | cafes, gyms, coworking, beaches | 25 | −4 |
| Weather: rain/drizzle/thunder | cafes, restaurants, coworking | 35 | −5 |
| Weather: clear | beaches, scenic | 20 | −5 |
| Learned favorites | visitor's `useAdaptiveMind.favorites()`, strongest first | 50 | −9 |

`scorePlace(place, ctx)` then adds place-specific terms on top of that
category-context score:

| Term | Formula | Notes |
|---|---|---|
| Category context | `categoryContextScores(ctx).get(place.category)` | the table above |
| Rating | `rating × 10` | 0–50 |
| Distance | `−distanceM / 150` | ~1 point per 150m — closer wins, no hard cutoff |
| Gem bonus | `+15`, or `+40` specifically in `hiddengems` mode | isGem only |
| Open-now | `+10` if `true`, `−20` if `false`, `0` if unknown | never penalize missing data |
| Price fit | `luxury`: `+priceLevel×6`; `cheapeats`: `+(4−priceLevel)×6`; else `0` | mode-conditional, matches `filterPlaces`'s own mode logic |

`rankPlaces` sorts by this score descending, ties broken by distance
ascending. `filterPlaces` (unchanged behavior, now generic) applies the hard
mode constraints *before* ranking — e.g. `hiddengems` mode only ever ranks
among places where `isGem` is true, with the existing "never leave the
visitor with a dead city" fallback (if a filter would empty a non-empty list,
it's skipped) preserved exactly as before.

## What changed in consumers

- **`app/page.tsx`**: `visiblePlaces` now calls `buildValidCandidates` instead
  of only `filterPlaces` — the main field's place order now reflects rating,
  distance, learned taste, and context, not just raw API order.
- **`lib/itinerary.ts`'s `composeJourney`**: gained an optional 4th parameter
  (`ctx: { travel?, phase?, weather?, favorites? }`, defaulting to neutral
  values so existing callers/tests don't break) and now ranks through
  `buildValidCandidates` using the energy's own `mode`. Concretely: the
  "Luxurious" energy's hotel step now actually excludes a budget, low-rated
  hotel when a better one exists in the pool — before this phase, it did not.
- **`lib/ai/buildContext.ts`**: candidate ordering now goes through
  `rankPlaces` with the request's own mode/travel/phase/weather/favorites,
  instead of a fourth hand-written copy of the same heuristic. The AI now
  reasons over candidates in the same priority order the rest of the app
  would show them in.
- **`components/concierge/Concierge.tsx`**: passes `mind.travel`,
  `theme.phase`, `env.weather.kind`, and `mind.favorites()` into
  `composeJourney` — context it already had in scope for the AI call (Phase
  5) but hadn't been wired into the deterministic path before.

## Testing

`lib/recommend.test.ts` (18 tests) and `lib/itinerary.test.ts` (10 tests) are
both new — neither file had any coverage before this phase. Together they
cover: the category-context golden case (hand-computed expected scores),
every individual scoring term in isolation, the generic `rankPlaces`/
`filterPlaces` working on a non-`Place` shape (proving the AI layer can share
them safely), the "never empties a non-empty list" guarantee, and that an
energy's mode now actually filters low-quality candidates in
`composeJourney`. `lib/ai/buildContext.test.ts`'s existing tests were
re-verified (not rewritten) against the new ranking — they still pass because
same-category candidates cancel out the category-context term, leaving the
rating/distance relationship the original tests asserted on intact.

## What's explicitly out of scope here

- **Supabase-synced memory** (`SUP-3` in `IMPLEMENTATION_PLAN.md`): learned
  affinities remain local-only (`localStorage` via `useAdaptiveMind`). This
  phase strengthens how existing signals are *used*, not where they're
  *stored*.
- **Price-level personalization** (learning a visitor's own budget preference
  beyond the current mode-conditional `priceFit` term): no such signal is
  persisted anywhere yet; adding one is a `MEM-2`-scoped follow-up, not done
  here to avoid inventing new persisted state mid-refactor.
- **Realtime presence, City Consciousness changes, i18n/performance work**:
  untouched, per the explicit phase ordering for this pass.
