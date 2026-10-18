# Narrative engine, language/RTL, and lifecycle audit (Phase 8)

Re-read fresh: every live narrative-generating surface (`Consciousness.tsx`,
`Concierge.tsx`, `lib/itinerary.ts`, `lib/ai/*`), every RTL-sensitive
layout primitive in `components/**`, and every `useEffect` that attaches a
browser listener or timer, rather than re-trusting Phase 6/7's conclusions
about files they didn't touch.

## Narrative engine

**Decision: no architecture change.** The deterministic narrator
(`Consciousness.tsx`, Phase 7) and the AI-concierge pipeline (`lib/ai/*`,
Phase 5/6) are both already sound — re-reading `lib/ai/anthropic.ts`,
`validate.ts`, and `types.ts` end to end found no new correctness bugs: the
anti-hallucination gate, the zod schemas, and the prompt's
instruction/data boundary all hold up.

Found and removed, two genuine pieces of dead code:

- `lib/itinerary.ts`'s `journeyWhisper()` — exported, never imported, never
  rendered, and hardcoded English (would have been an i18n bug the moment
  anything called it). Fully superseded by the live, translated
  `con.whisper`/`con.empty` keys already rendered in `Concierge.tsx`.
- `lib/recommend.ts`'s `whisper()` and `MODE_META` — same pattern: a fourth
  "best place"/narrative heuristic left over from before Phase 6 unified the
  ranking engine, never called from anywhere, hardcoded English. Phase 6's
  own stated goal was eliminating exactly this kind of duplicate.

**Test coverage gap found and closed.** `components/concierge/Concierge.tsx`
— the component that actually composes the deterministic journey, calls
`/api/concierge`, and swaps in the AI narrative — had zero tests, despite
`lib/ai/*` and the route itself being well covered. Added
`Concierge.test.tsx` (3 tests, mocking `fetch`): the deterministic journey
renders with no AI narrative when the AI call returns `ai: null`; the AI
narrative and reordered stops swap in when `/api/concierge` returns valid,
candidate-id-referencing data; and an AI response needing no human action
to degrade (treated as `ai: null`) still leaves a correct deterministic
journey on screen.

## Language and RTL (IMPLEMENTATION_PLAN.md's I18-2 / I18-3 / I18-4)

**I18-3 (dynamic content translation coverage) re-verified, still resolved.**
`npm run i18n:check` still reports zero missing keys across all 9 languages;
every "identical to English" suspect it flags is a legitimate cognate or the
intentionally-untranslated brand name, confirmed line-by-line against
`lib/i18n.ts`.

**I18-2 (RTL behavior audit) — real bugs found and fixed.** Tailwind's
physical `text-left`/`text-right`/`ml-*`/`mr-*` utilities don't follow
`dir="rtl"` (unlike `items-start`/`items-end`, which are flexbox
cross-axis-relative and already correct). Five real leaks, fixed with their
Tailwind v4 logical equivalents (`text-start`/`text-end`/`ms-*`/`me-*`,
confirmed present in this version's compiled utility set before use):

- `components/concierge/Concierge.tsx` — energy-picker buttons, journey stop
  rows, and the distance/rating column (3 occurrences).
- `components/discovery/AtmospherePicker.tsx` — atmosphere menu items.
- `components/hud/HudMenu.tsx` — HUD dropdown menu items.
- `components/discovery/PlaceDetail.tsx` — the "hidden gem" badge's leading
  margin (`ml-2` → `ms-2`).
- `components/organism/Consciousness.tsx` — the narrator's leading breathing
  dot (`mr-2` → `me-2`).

Fixed HUD-corner docking (`AtmospherePicker` pinned left, the Concierge orb
and map zoom controls pinned right, both via physical `left-*`/`right-*`)
was **deliberately left alone** — these are spatial, compass-like overlay
anchors, not reading-direction content; flipping them via logical
`start-*`/`end-*` would move widgets to the opposite screen corner under
Arabic, a product redesign decision, not a bug fix, and risks the
Concierge orb and the AtmospherePicker menu landing in the same corner.

Added the structural Playwright test the plan asked for,
`tests/e2e/rtl.spec.ts`: loads the app, picks Arabic from the language gate,
asserts `document.documentElement` actually flips to `dir="rtl"`/`lang="ar"`,
and asserts no horizontal overflow after the five fixes above. **Passes.**

**I18-4 (language persistence & SEO) — investigated, deliberately not
implemented; flagging as a decision point.** `app/layout.tsx` hardcodes
`<html lang="en">`; the real language is only set client-side after mount.
The plan's proposed fix (`next/headers`'s `headers()`, reading
`Accept-Language` to set the initial `lang`/`dir` before any client JS runs)
was implemented, verified correct (9 passing unit tests on the parser, a
`curl -H "Accept-Language: ..."`-equivalent build check), and then
**reverted** after measuring its real cost: calling `headers()` anywhere
under the root layout forces Next to drop static generation for the
*entire app*, not just add a per-request header read. Confirmed by
building both ways:

| `app/layout.tsx` | `next build`'s `/` route |
|---|---|
| hardcoded `lang="en"` (current) | `○` static, prerendered |
| reading `headers().get("accept-language")` | `ƒ` dynamic, server-rendered every request |

The plan's own acceptance criteria said "Performance considerations: none
(one header read, no added latency)" — that's true of the header read
itself, but misses that it's not the read that costs anything; it's that
Next's static/dynamic boundary is all-or-nothing per route tree, and the
whole app sits under this one layout. Converting ECHO EARTH's single public
route from a CDN-cacheable static shell to a server-rendered-every-time page
is a real architectural cost for a small, cosmetic, crawler-only win (the
app already corrects `lang`/`dir` correctly and fast on the client — see
`app/page.tsx`'s existing effect — so a human visitor never sees "en" even
today).

**Left for you to decide**, same shape as I18-4's other half (per-language
routing):
1. Accept the static→dynamic tradeoff and re-apply the `headers()` fix (the
   implementation above is correct and tested; it's sitting in this
   session's `git stash` — `git stash list` — not deleted, just not shipped
   silently).
2. Implement it at the edge instead (Next/Vercel Middleware doing a
   byte-level `<html lang="en">` rewrite on the static HTML stream) — keeps
   the cacheable static shell, more code and a real correctness-under-
   streaming risk, not built here.
3. Leave it as-is — the mismatch is real but cosmetic (crawlers that don't
   execute JS see "en"; every real visitor gets the correct language within
   one client render).

No action taken by default; nothing in the shipped diff touches
`app/layout.tsx`.

## Lifecycle / performance

Two real, confirmed listener leaks in `engine/useEnvironment.ts` — found by
noticing every other sensor effect in the file follows an `alive`-flag +
cleanup-function pattern except these two, which had neither:

- **Battery** (`getBattery().then(...)` ): no cleanup at all. If the
  component ever remounts (React Strict Mode's intentional dev-mode
  double-invoke, or a future real remount), the `levelchange` listener
  accumulates — and the original code could also call `setBatteryLevel`
  after unmount, since the promise's `.then` had no unmount guard.
- **Network** (`navigator.connection`): same shape — a `change` listener
  attached with no corresponding `removeEventListener` in a cleanup
  function.

Both fixed with the same `alive` + explicit `removeEventListener` cleanup
already used two effects below them in the same file (the media-query
effect). `engine/audio.ts`'s unremoved `visibilitychange` listener was
checked and is **not** a bug: `ambient` is a deliberate module-level
singleton constructed once for the whole page lifetime (confirmed via
Phase 5's own audit, commit `d488ea0`), so there's exactly one listener for
the life of the tab — nothing to clean up.

No new performance regressions: production bundle for `/` is unchanged at
117 kB / 220 kB First Load JS (identical to the Phase 7 baseline).
