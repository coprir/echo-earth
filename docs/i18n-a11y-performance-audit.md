# Internationalization, RTL/accessibility, and performance audit (Phase 9)

Full re-read of `lib/i18n.ts`, every language-selection component, the
narrator, the AI concierge, and every dismissible overlay in the app,
rather than re-trusting prior phases' conclusions about files they didn't
touch. Companion to `docs/narrative-i18n-rtl-audit.md` (Phase 8) and the
checkpoint-verification note appended to `PROJECT_STATUS.md` between the two.

## 1. Internationalization audit

**Languages verified from source** (`lib/i18n.ts`'s `Lang` type + `LANGS`
array, re-confirmed by `scripts/i18n-report.test.ts`'s own assertion):
`en, ar, fr, zh, es, ru, el, tr, de` — 9 languages. Arabic is the only RTL
language (`dirOf`).

**Translation-completeness checker**: already existed
(`scripts/check-i18n.ts` / `npm run i18n:check`, backed by
`scripts/i18n-report.ts`) and **already fails CI** — it's wired into the
real test suite (`scripts/i18n-report.test.ts`, run on every `npm run
test`) against the live `DICTIONARIES` export, not a synthetic fixture.
Re-ran it: **zero missing keys in any language**, confirmed again. No new
checker was built — one already satisfies the brief's ask.

**Real gap found and fixed**: `components/i18n/LanguageGate.tsx` — the
*very first screen* every visitor sees — had two hardcoded-English strings
that were never translated: the listbox's `aria-label="Choose your
language"` and the footer "you can change this anytime." Ironic for the
language-picker itself. Fixed by adding `gate.aria`/`gate.footer` keys to
all 9 language dictionaries (reusing the exact, already-shipped translation
of "Choose your language" from the gate's own visible multilingual line for
`gate.aria`, to avoid introducing a new, unreviewed translation for text
that's already proven correct elsewhere in the same component) and wiring
both through `translate(lang, …)`, keyed off the same auto-detected
`lang` that already highlights the suggested option — so a screen-reader
user now hears the gate's own label in their detected language, not always
English.

**Everything else user-facing was already correctly routed through `t()`**:
exhaustive greps for hardcoded `aria-label=`, `placeholder=`, `title=`,
`alt=`, and bare JSX text nodes across every component and `app/` found
*nothing else*. Specifically checked and confirmed clean: navigation
(HudMenu), forms (Concierge's tourist/local radio, energy picker), loading
states (`con.loading`, `field.growing`, `hud.locating`), and the narrator
(`Consciousness.tsx`, previously audited in Phase 7, re-confirmed still
clean).

**Deliberate, documented exceptions — not bugs**:
- **The root `<ErrorBoundary>` fallback** (`app/layout.tsx`: "the organism
  lost its signal — reload") is the one hardcoded-English string left in
  the whole app, and it stays that way on purpose: it's the last-resort
  "React itself crashed" UI, rendered from a Server Component with no
  reliable way to know the visitor's language (the client-side `lib/i18n.ts`
  zustand store that would normally answer that question may itself be part
  of what crashed). Browsers' own built-in crash UIs follow the same
  convention. Translating it would require making the *global* error
  boundary depend on client-side state that isn't guaranteed to survive
  whatever triggered the fallback in the first place.
- **`app/layout.tsx`'s `metadata` (title/description/OpenGraph)** is
  single-language (English) by construction — this app has one canonical
  URL (`ARCHITECTURE.md` §8), so there's no per-language route for a
  crawler to land on with a different `<meta>` block. Same root cause and
  same architectural tradeoff as §2 below; not a new finding.

**AI Concierge response language — a real, unenforced instruction, not a
verified guarantee.** `lib/ai/anthropic.ts`'s system prompt instructs the
model to "Respond in the language given by the REQUEST's 'language' field,"
and the client always sends the visitor's actual `lang`. But nothing
server-side verifies the model's `narrative`/`reason` text is *actually* in
that language — `lib/ai/types.ts`'s `ConciergeAIResponseSchema` only checks
length bounds, and `lib/ai/validate.ts` only checks that `placeId`s are real
candidates (by design — that's the anti-hallucination gate, not a language
check). Deliberately **not adding automated language detection** here: it
would need a new dependency for marginal protection against a failure mode
(the model ignoring one explicit instruction line) that has never been
observed, since `ANTHROPIC_API_KEY` has never been set in this environment
end to end. **Flagging for human review**: once a real key is configured,
spot-check a few `/api/concierge` responses in non-English languages before
trusting this at scale.

**Inconsistent terminology**: spot-checked "concierge" across the French
dictionary (the language most likely to have a drifting synonym, since
French has multiple reasonable translations) — consistent everywhere.
A full 9-language terminology-consistency pass is a job for native
speakers per language, not something to approximate here — **documented as
requiring human linguistic review**, not attempted.

## 2. Language negotiation and rendering (the outstanding Accept-Language decision)

Re-examined rather than re-implemented. The checkpoint's finding stands:
reading `headers().get("accept-language")` anywhere under the root layout
is a genuinely correct per-request signal, but Next.js's static/dynamic
split is all-or-nothing per route tree — doing it converts `/` from `○`
(static, CDN-cacheable) to `ƒ` (dynamic, rendered on every request)
app-wide, confirmed again via `next build`'s own output in this phase.

**No dynamic rendering was introduced.** Evaluated the explicitly-suggested
static-compatible alternatives:
- **Predictable default language**: already the status quo —
  `app/layout.tsx` ships `<html lang="en">` statically, same as before.
- **Client-side language negotiation**: already exists and is unchanged —
  `app/page.tsx`'s effects call `autoFromNavigator()` then
  `autoFromCountry()` (IP-geolocated, takes priority once it resolves) and
  write `document.documentElement.lang`/`dir`, before the visitor sees the
  language gate's suggestion highlight. No functional defect was found in
  this path this phase either (no hydration warnings, no reported
  flash) — per the instruction to prefer current behavior absent a
  demonstrated defect, it was left as-is rather than patched speculatively.
- **Explicit language-preference persistence**: already exists —
  `useLang`'s zustand `persist` middleware (`"ee-lang"` in `localStorage`)
  plus the `"ee-lang-chosen"` flag that skips the gate for returning
  visitors. Unchanged; already correct and now has direct test coverage
  (`components/i18n/LanguageGate.test.tsx`, `LangSwitcher.test.tsx`) for the
  first time.

**Conclusion: no code change for this item.** The real remaining gap — a
non-JS crawler sees `lang="en"` in the raw HTML regardless of its
`Accept-Language` header — is cosmetic (every real visitor's browser
corrects it within one client render) and architecturally entangled with
the bigger, already-flagged per-language-routing question
(`IMPLEMENTATION_PLAN.md`'s I18-4). Left as a human decision point; the
previously-built, tested `headers()` implementation remains in this
session's `git stash`, not deleted, not reapplied.

## 3. RTL and accessibility

**Real bugs found and fixed** (each confirmed by a failing automated test
before the fix, not just read-through):

1. **`LangSwitcher.tsx`'s active-language marker (`●`) had no
   `aria-hidden`** — it was part of the button's accessible name (a
   screen reader would announce e.g. "Français ●" instead of just
   "Français"), redundant with the `aria-pressed="true"` that already
   conveys the same state semantically. Fixed; caught by
   `LangSwitcher.test.tsx`'s own assertion failing on the polluted name
   before the fix.
2. **`Concierge.tsx`'s "hidden gem" indicator on journey stops** (`✦`, no
   accompanying text) conveyed the gem status visually but announced
   nothing meaningful to a screen reader (an isolated star-glyph character,
   if announced at all). Fixed by pairing it with a `sr-only` translated
   label (`t("detail.gem")`) and marking the glyph itself `aria-hidden` —
   now matches the parity `PlaceDetail.tsx`'s equivalent badge already had.
3. **No dismissible overlay in the app closed on Escape** — Concierge,
   About, PlaceDetail, HudMenu, AtmospherePicker, and LangSwitcher all
   required a mouse click (backdrop or an explicit `✕`) to close, with no
   keyboard equivalent, contrary to standard WAI-ARIA dialog/menu
   expectations. Fixed with one new, shared, 10-line hook
   (`engine/useEscapeToClose.ts` — DOM-dependent, so it follows this
   repo's existing convention of routing browser-sensing hooks through
   `engine/`, matching `useEnvironment`/`useAdaptiveMind`) wired into all
   six components, rather than duplicating a keydown listener six times.
   Covered by a dedicated hook test (4 cases) plus one integration
   assertion in `Concierge.test.tsx` that Escape actually closes the real
   rendered dialog.

**Carried over from Phase 8, re-verified still correct**: the 5 physical
`text-left`/`text-right`/`ml-*`/`mr-*` → logical `text-start`/`text-end`/
`ms-*`/`me-*` fixes, and `tests/e2e/rtl.spec.ts`'s structural RTL check —
still passing.

**Checked and confirmed already correct (no action needed)**:
- **Focus states**: `app/globals.css` never touches `outline`, and no
  component uses `outline-none` — native keyboard focus rings work
  everywhere by default; nothing suppresses them.
- **Icons/directional indicators**: no arrow glyphs or inherently-directional
  icons exist anywhere in the UI (checked — only neutral category icons,
  glyphs, and the "⌖"/"✦"/"●" markers, none of which encode left/right
  meaning), so there was nothing to mis-mirror and nothing to protect from
  future mechanical mirroring.
- **Map controls** (`NeuralMap.tsx`'s zoom buttons): already have a
  correctly-translated `role="group" aria-label={t("map.zoomgroup")}`.
- **Navigation/dropdown positioning**: `LangSwitcher.tsx`'s dropdown already
  anchors with the logical `end-0` (not a physical `right-0`) — confirmed
  this was already right, consistent with the HUD-corner-docking
  distinction drawn in Phase 8 (spatial overlays stay physical by design;
  anchors relative to their own trigger are logical).
- **Reduced-motion** (engine-level): `engine/environment.ts`'s
  `resolveTheme` already zeroes `particles`/`particleDensity`/
  `motionIntensity` for `prefersReducedMotion`, and `PlanetaryEntry.tsx`
  already compresses its whole cinematic intro sequence under it. Verified
  with 8 new unit tests (`engine/environment.test.ts`) that also lock in
  the deliberate PRF-1 decision below as a regression guard.

**Fixed, not just checked — reduced-motion at the UI-animation layer.**
The engine-level checks above only ever covered the big WebGL/motion-
intensity systems; the many *other* framer-motion transitions (every modal
and dropdown's spring-in, the narrator's blur/fade) never checked
`prefers-reduced-motion` at all — a visitor with that OS preference set
would still get full spring/blur animations on every menu and dialog.
Fixed app-wide with one line: `app/page.tsx` now wraps its root in
framer-motion's own `<MotionConfig reducedMotion="user">`, which makes
every `motion.*` component in the tree respect the OS preference
automatically (framer-motion's own well-tested mechanism — not
independently re-tested here beyond the existing structural Playwright
check below, to avoid the brittle-animation-timing-assertion trap the brief
explicitly warns against).

**New automated coverage**: `tests/e2e/reduced-motion.spec.ts` — emulates
`prefers-reduced-motion: reduce` and asserts the app still reaches the main
field with zero page errors (a structural smoke test, not an animation-
timing assertion).

**Contrast — measured, not eyeballed; one real finding, documented, not
fixed.** Implemented the actual WCAG relative-luminance/contrast-ratio
formulas against `engine/environment.ts`'s real `h(hue, s, l)` palette
function and ran them across 6 representative moods spanning the app's
real hue range:

| mood | text/bg | textDim/bg | accent/bg | text/surface |
|---|---|---|---|---|
| Nightbloom (night) | 16.95 | 8.36 | 11.88 | 15.44 |
| Goldenform (summer day) | 13.78 | 7.78 | 5.64 | 10.90 |
| Neon Storm | 16.77 | 8.66 | 15.01 | 14.81 |
| Frostform (snow) | 16.75 | 8.94 | 13.09 | 14.60 |
| Rainmind (rain) | 16.86 | 8.69 | 8.86 | 15.02 |
| **Palefire (winter day)** | 14.38 | 7.79 | **3.38** | 11.76 |

`text`/`textDim` against the background clear WCAG AA (4.5:1) and AAA
(7:1) comfortably in every sampled mood. **`accent` against `bg` drops to
3.38:1 in "Palefire" (winter daytime)** — below AA's 4.5:1 for normal
text. `--ee-accent` is used as actual small (`text-[10px]`) text color in
one place that matters: the Concierge's "✦ AI-refined" badge
(`components/concierge/Concierge.tsx`). **Not fixed here** — the only
correct fix is a palette-level change (a separate, slightly-adjusted
accent-for-text variable, or retuning Palefire's accent lightness), and
this audit's scope is explicitly "do not redesign the experience." Flagging
with exact numbers for a deliberate design decision, the same way PRF-1
(particle density) was flagged rather than silently changed.

Contrast for the other 3 supported synthetic/natural moods not sampled
above, and every combination with every atmosphere override, was not
exhaustively computed — the 6 sampled here span the real hue/lightness
range closely enough to be representative, but a full matrix is available
to compute the same way if wanted (the script is a ~40-line Node file using
`engine/environment.ts`'s own formulas, not reproduced in the repo since it
was a one-off measurement tool, not application code).

## 4. Performance audit

**Measured, not assumed** (`npm run build`, same machine, same method as
every prior phase):

| | before this phase (Phase 8, `82551e2`) | after this phase |
|---|---|---|
| `/` page size | 117 kB | 118 kB |
| `/` First Load JS | 220 kB | 221 kB |
| `/` render mode | `○` static | `○` static (unchanged) |
| `node_modules` | includes `gsap` (6.4 MB on disk) | `gsap` removed |
| `npm ls` package count | 544 | 543 |

The ~1 kB bundle growth is real and attributable to this phase's actual
additions (`MotionConfig` import, 2 new i18n keys × 9 languages, the
`useEscapeToClose` hook) — reported honestly rather than claimed as
"unchanged." It is not a regression worth chasing.

**Oversized/unused dependency found and removed**: `gsap` (`^3.15.0`) was
listed in `package.json` and installed (6.4 MB) but **never imported
anywhere in the source** — confirmed by grepping the whole repo (only
hits were in `package.json`/`package-lock.json`/two docs files that had
*speculated* it was used in `PlanetaryEntry`/`LivingEarth`, per
`IMPLEMENTATION_PLAN.md`'s still-open `PRF-2` item — checked both files
directly: neither imports it). Removed via `npm uninstall gsap`. Effect is
install-footprint and dependency-tree hygiene (one fewer package to
`npm audit`, 6.4 MB less to install), **not** a production bundle-size win,
since an unimported dependency was already contributing zero bytes to the
shipped JS — reported precisely as that, not oversold as a "performance
fix."

**Investigated for unnecessary rerenders / redundant calculations /
duplicate requests / lifecycle leaks** — re-read the heaviest components
fresh:
- `components/organism/ParticleField.tsx` (WebGL/R3F): already well-
  optimized (`antialias: false`, `powerPreference: "low-power"`, `dpr`
  capped at 1.5, additive blending with `depthWrite: false`) and R3F's own
  automatic GL-resource disposal on unmount handles cleanup — no leak, no
  change made.
- `components/map/NeuralMap.tsx` (canvas 2D + RAF loop + 8 event
  listeners): the effect that sets all of this up runs exactly once
  (`[]` dependency array) and reads live props through a ref
  (`propsRef`/`zoomAtRef`), the same "latest ref" pattern already verified
  correct in `Consciousness.tsx` (Phase 7) — avoids both stale closures and
  the far worse alternative (tearing down and rebuilding the canvas/RAF/
  listeners on every prop change). `ResizeObserver` and all 8 listeners are
  correctly disconnected/removed in the effect's cleanup. No bug found, no
  change made.
- `app/page.tsx`'s places-fetching effect already has the `alive` +
  `AbortController`-equivalent guard pattern and a correct dependency array
  (`[env.lat, env.lon, category]`) — no duplicate-fetch pattern found.
- GSAP: see above — moot, since it's not used at all.

**Carried forward from Phase 8** (not re-verified line-by-line again this
phase, no reason to suspect regression): the two listener-leak fixes in
`engine/useEnvironment.ts` (battery, network) remain in place.

## 5. Adaptive experience

**PRF-1 (particle density not scaled by perf tier) — confirmed unchanged,
on purpose.** Re-read `engine/environment.ts`'s `tier` computation and its
own comment, and `ARCHITECTURE.md` §3's documentation of it, fresh. No new
evidence surfaced this phase that would justify revisiting a decision
that's explicitly flagged as "requires your sign-off, not changed" — doing
so without real device-profiling data (the acceptance criterion
`IMPLEMENTATION_PLAN.md`'s `PRF-1` itself specifies: "throttling a test
browser to a low-end CPU profile measurably reduces particle count") would
be exactly the kind of unauthorized product-decision change the brief
explicitly warned against. **Added a regression test instead**
(`engine/environment.test.ts`'s last case) that locks in today's behavior
(`perfTier: "low"` produces identical `particleDensity`/`particles` to
`perfTier: "high"`) so a future change to this specific line is a visible,
intentional diff, not an accidental regression.

**Graceful degradation — verified, not just inspected**: Survival Mode
(battery < 15% or save-data) and `prefers-reduced-motion` both correctly
disable particles and reduce motion, now with explicit test coverage for
both triggers independently and in combination (`engine/environment.test.ts`).
WebGL-unavailable: `ParticleField`'s parent (`app/page.tsx`) already wraps
it in an `<ErrorBoundary>` with no fallback (renders `null` on failure) —
confirmed this means a WebGL context-creation failure degrades to "no
particles," not a crashed page; not independently re-tested here since
simulating a real WebGL failure in jsdom/Playwright chromium (which has
real GPU support) isn't practical, and the `ErrorBoundary` component itself
already has its own test suite (`components/ErrorBoundary.test.tsx`).

## 6. Testing — summary of what's new

| file | tests | covers |
|---|---|---|
| `lib/i18n.test.ts` | 11 | `translate` fallback chain, `dirOf`, `langFromCountry` (incl. Northern Cyprus), `langFromNavigator` (incl. the Node-global-`navigator` bug below) |
| `components/i18n/LanguageGate.test.tsx` | 5 | the new translated aria-label/footer, language choice → persistence → `onDone`, suggested-language highlighting |
| `components/i18n/LangSwitcher.test.tsx` | 4 | opening the list, active-state marking, switching persists `manual`, manual blocks later auto-detect |
| `engine/environment.test.ts` | 8 | `timePhase`/`season` boundaries, Survival Mode, reduced-motion, the PRF-1 regression guard |
| `engine/useEscapeToClose.test.tsx` | 4 | the new shared hook, isolated from any component |
| `components/concierge/Concierge.test.tsx` (+1) | — | Escape closes the real rendered dialog |
| `tests/e2e/reduced-motion.spec.ts` | 1 | structural: app still loads under emulated reduced motion |

**One real, previously-unknown bug caught by writing a test, not by
inspection**: `lib/i18n.ts`'s `langFromNavigator()` guarded SSR-safety with
`typeof navigator === "undefined"`. Node 18+ ships its own built-in global
`navigator` (confirmed: `navigator.language` returns the OS locale, e.g.
`"en-US"`, under real Node 22) — so that guard no longer reliably detects
"no browser." In this app it was never a live bug (the function is only
ever called from inside a `"use client"` component's `useEffect`, never
during SSR), but the guard's own claim was wrong, and a future call-site
outside an effect would have silently read the server's locale instead of
returning `null`. Fixed by guarding on `typeof window === "undefined"`
instead, matching the SSR-detection idiom this codebase already uses
correctly elsewhere (`engine/useEnvironment.ts`'s `detectDevice`).

All new tests avoid asserting on exact animation timing or pixel values —
the RTL/reduced-motion Playwright specs are structural (overflow,
"did it crash"), and the Concierge/LangSwitcher tests that cross an
`AnimatePresence` exit transition use `waitFor` with real timers rather
than asserting synchronously, the same pattern Phase 7 already established
for this codebase's framer-motion components.
