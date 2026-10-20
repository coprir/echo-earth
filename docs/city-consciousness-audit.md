# City Consciousness audit (Phase 7)

Audit of the live narrator, `components/organism/Consciousness.tsx`, re-read
fresh rather than assuming the Phase 2 correction (which identified it as the
*real* live narrator, as opposed to the dead `engine/consciousness.ts` draft)
still fully described its current state.

## Decision: stays deterministic

Per the standing instruction and `CNS-1` in `IMPLEMENTATION_PLAN.md`: **do
not** convert this to an LLM call. Nothing found in this audit changes that
conclusion — if anything it reinforces it:

- It recomposes every ~14 seconds for as long as the organism is awake. An
  LLM call at that cadence would be slower (seconds vs. sub-millisecond),
  cost real money per visitor per tick, and — based on reading the actual
  phrase banks — would need substantial prompt engineering to match writing
  that's already specifically tuned, poetic, and on-brand.
- It's fully offline and already speaks correctly in all 9 supported
  languages (verified via `scripts/check-i18n.ts` — zero missing `nar.*` /
  `atmo.*.whisper` keys).
- No part of its current responsibility (noticing idle time, travel mode,
  weather, learned favorites, phase-of-day, city sync) benefits from
  open-ended reasoning — it's a bounded, well-understood candidate-weighting
  problem, not a judgment call an LLM would meaningfully improve.

The brief allows for "occasional richer narrative generation" via AI where
appropriate — no such feature was requested or added here. The
`lib/ai/` pipeline (Phase 5/6) exists and could serve a future, explicitly
rare feature (e.g. a once-per-session "reflect on my visit" summary) without
any new AI integration work, but building that wasn't in scope for an audit
pass and wasn't requested.

## What the audit found (and fixed)

Three real issues, found by reading the component line-by-line rather than
re-trusting the earlier pass:

### 1. A real stale-closure bug (fixed)

The component recomposes on a **narrow, deliberate** set of triggers —
`lang`, `env.weather.kind`, `mind.mode`, `mind.atmosphere`, `mind.travel` —
so the speaking cadence stays steady rather than resetting on every minor
environment tick. But the `compose()` closure that trigger list re-captures
also reads `env.now` (which drives the phase-of-day line) and `env.city`
(the city-sync line) — fields **not** in that trigger list. Between
restarts, those could go stale for as long as weather/mode/atmosphere/travel
happened to stay constant — plausibly hours in a typical session — causing
the narrator to announce the wrong time-of-day phase or a stale city name.

Fixed with a "latest ref" pattern: `tickRef.current` is reassigned to a fresh
closure on every render (capturing current `env`/`mind`/`t`), while the
`setTimeout`/`setInterval` that actually fire are still only created on the
original, deliberately-narrow trigger list — preserving the exact intended
cadence while always reading current state. No behavior change to *when* the
voice speaks, only to *what it can see* when it does.

### 2. Dead prop plumbing (removed)

`Consciousness`'s type signature accepted `category: string` and
`placeCount: number` props, and `app/page.tsx` dutifully passed both
(`category={category} placeCount={visiblePlaces.length}`) — but the
component only ever destructured `{ env }`; neither prop was read anywhere,
and no translation key (`nar.*`) exists that would use either (confirmed via
a full grep of `lib/i18n.ts`'s `nar.*` key set). Removed both from the
component's signature and the call site. This isn't a half-built feature
losing its hook-in point — there was no corresponding content for either
value to begin with.

### 3. Accessibility inconsistency (fixed)

The decorative pulsing-dot span (purely visual, no text content) was missing
`aria-hidden`, while the *identical* pattern elsewhere in the app
(`components/hud/VitalsHUD.tsx`'s own breathing dot) already has it. Low
practical impact (an empty span conveys nothing to assistive tech regardless)
but a real, demonstrable inconsistency with the app's own established
convention — fixed to match.

## Testability

`compose()` had zero test coverage and, before this audit, wasn't even
independently callable — it was defined inline inside the component,
closing over props/state, so testing it meant rendering the component and
fighting timers. Extracted to a pure, exported function
(`compose(seed, input: ComposeInput)`) taking every input explicitly. This
both makes the actual narration logic properly testable and is *part of* the
stale-closure fix: a function with no implicit closures can't go stale.

`components/organism/Consciousness.test.tsx` (new, 9 tests):
- 8 tests against the pure `compose()` function, including a hand-computed
  "golden case" (seed=0, only the phase and city-sync candidates present)
  proving the exact scoring formula, and explicit notes on which candidates
  have a genuine mathematical "always wins" margin (atmosphere weight 6 and
  driving weight 7 both always beat the phase line's weight-2 worst case)
  versus which don't (walking's weight 4 can lose to phase at unfavorable
  seeds — tested at one hand-verified seed instead of asserting a universal
  win, to avoid a flaky/incorrect test).
- 1 smoke test that the component mounts and speaks for real, using real
  timers.

**A real, confirmed hang was hit and fixed while writing these tests, not
just avoided in theory:** combining `vi.useFakeTimers()` (which by default
also fakes `requestAnimationFrame`) with rendering this component (which uses
framer-motion's `AnimatePresence`/`motion.p`) caused the vitest worker to
hang indefinitely — confirmed by the process never exiting and having to be
killed. The detailed logic is covered by the pure-function tests, which need
no timers at all, so the component-level test deliberately uses real timers
instead of fighting that interaction.

## What's unchanged

Everything else — the phrase banks, the weighting formula, the translation
keys, the `aria-live="polite"` region, the visual design — is exactly as it
was. This audit's job was to verify, not redesign.
