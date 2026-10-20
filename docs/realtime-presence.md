# Realtime explorer presence — privacy threat model & design

Implements `PHASE 8 — Realtime Presence` (`RTP-1`/`RTP-2`/`RTP-3` in
`IMPLEMENTATION_PLAN.md`), re-derived against this session's stricter brief
rather than implemented as originally sketched — see "Deviations from the
original RTP-1/2/3 plan" below for what changed and why.

## Product objective

Let a visitor feel that other explorers exist in the same city, right now,
without the experience ever looking like a surveillance map or claiming
anything untrue about who's online.

## 1. Architecture selected

**Supabase Realtime Presence, channel-only, no new table.** The smallest
architecture that satisfies "ephemeral presence preferred, don't create a
new backend service":

- One Realtime channel per city (`presence:city:<slug>`, `lib/presence.ts`).
  Scoping per city keeps channel membership relevant (you only ever hear
  from explorers roughly near you) and keeps the blast radius of any one
  channel small.
- Each client `.track()`s exactly one field: `{ cell }`, a geohash
  (`lib/geohash.ts`, precision 5, ~4.9km × 4.9km).
- "Who" is never our concern to model: Supabase's own per-connection
  presence ref is the only identity the channel has, we never read or
  store it, and it rotates on every reconnect by the library's own design.
- Nothing is persisted to Postgres. Presence state lives only in Realtime's
  in-memory tracker for as long as a socket is connected; it disappears the
  instant that socket closes (tab close, network loss, explicit leave) —
  Supabase's own leave-on-disconnect, not custom code we have to get right.
- Authorization is still real: a new migration
  (`supabase/migrations/20261019000000_presence_realtime_authorization.sql`)
  turns on Supabase's Realtime Authorization (RLS on `realtime.messages`)
  so only a connection with an active session (anonymous sign-in counts) can
  subscribe to or write on a `presence:city:*` topic — see §6.

This is deliberately smaller than `RTP-1`'s original sketch (a custom
`ephemeralId` field, bearing-mapped sparks). See the deviations section for
why.

## 2. Privacy threat model

### Data collected and why

| Field | Collected? | Purpose | Notes |
|---|---|---|---|
| Geohash cell (`cell`, 5 chars, ~4.9km²) | Yes — the only thing ever broadcast | Lets the client decide "is anyone else nearby" in aggregate | Computed client-side from real lat/lon; the real coordinate never leaves the browser for this feature |
| Raw lat/lon | **No** | — | Never serialized into any presence payload, never logged by this feature |
| Visitor identity (`auth.uid()`, `client_seed`) | **No** | — | Not read by `engine/usePresence.ts` at all beyond checking a session exists |
| Supabase's own presence ref | Exists (library-internal), never read by our code | Needed by Realtime itself to track who's connected | Ephemeral, rotates every reconnect, not persisted anywhere |
| IP address | No (not by this feature) | — | The existing `/api/geo` route already resolves IP → city server-side for the *unrelated* city-detection feature; that resolved city/country is what's reused here, the IP itself never reaches this feature |
| Timestamp | **No** | — | Presence is live-by-construction (if tracked, you're online *now*); no client-supplied timestamp is ever trusted or even requested |

### Purpose of each field

- `cell`: the entire visual feature. Without it, there is nothing to
  render beyond "someone is in this city," which the channel scoping
  already gives you for free — `cell` exists only in case a future,
  separately-reviewed feature wants coarser-than-city but finer-than-exact
  placement. **The current UI (`PresenceField.tsx`) does not use `cell` for
  placement at all** — see §7.

### Data retention

None. Nothing from this feature is written to a database, a log file, or
`localStorage`. The moment a socket disconnects, that presence entry is
gone — there is no retention period to configure because there is no
persistence to begin with.

### Who can read the data

Any client authorized onto a `presence:city:<slug>` channel (an
authenticated — anonymous sign-in included — Supabase session, per the
migration in §6) receives every other member's `{ cell }` payload for that
city, by design — that's how Presence works, every subscriber sees every
tracked payload. This is the central reason the payload itself must stay
harmless: there is no further access control *within* a channel once
you're in it.

### Abuse scenarios considered

- **A malicious client joins and tracks a fabricated `cell`.** No defense
  possible or needed — the feature's entire premise is "ambient feel," not
  a verified census. `lib/presence.ts`'s `parsePresencePayload` defensively
  validates shape before any consumer trusts it, but even a well-formed
  fake cell can only ever inflate a count by one. The product cannot be
  harmed by someone pretending to be one more explorer than they are.
- **A client subscribes without ever intending to show up on the map,
  purely to count real explorers in a city.** Possible (this is inherent to
  any Presence-based feature — anyone authorized onto the channel sees the
  aggregate). Mitigated by requiring a Supabase session to even connect
  (§6), which raises the cost of mass-scraping above "open the public page"
  but does not prevent it from a signed-in client. Documented, not solved —
  there is no architecture that makes a broadcast channel un-observable to
  its own authorized members.
- **A client floods the channel with rapid track/untrack cycles.**
  Supabase Realtime has its own connection/message-rate limits at the
  infrastructure level; this app adds no custom rate limiting on top
  because there is no write path other than Realtime's own `track()`, which
  is already the thing the platform is built to handle at scale. Flagged,
  not independently re-implemented.

### Location privacy risks

- **Re-identification via repeated cells.** This is the single most
  important risk `RTP-1`'s own brief calls out ("do not promise anonymity
  merely because the user ID is hidden"). A visitor who stays in the same
  ~4.9km cell for an entire session reveals nothing more than "someone is
  in this cell" to channel peers — a single cell by itself does not
  identify or track anyone, and 4.9km is far too coarse to correlate with
  a specific building, let alone a specific person. The genuine risk is
  only present if the *same* cell sequence could be linked across sessions
  to the *same* underlying identity by an outside observer with other data
  — not possible here, since this feature broadcasts no identity at all,
  ever, to link anything to.
- **Movement inference.** If a client's tracked cell changed every time
  they moved a few hundred meters, a channel peer watching the *stream* of
  presence updates over time could in principle infer a rough path. This
  app does not update `cell` continuously — it is computed once per
  `usePresence` join (tied to `enabled`/visibility re-joins, not to every
  `env.lat`/`env.lon` tick) and only re-sent on an explicit rejoin (tab
  becoming visible again, a city change). Nothing re-tracks on every GPS
  update. Combined with the coarse cell size, meaningfully reconstructing
  movement from this feature is not possible with the data it emits.

### Unauthorized subscription risks

Addressed structurally, not just by policy: `engine/usePresence.ts` never
creates a channel without first confirming an active Supabase session
exists, and the server-side migration in §6 independently enforces the
same requirement via Realtime Authorization — so an unauthenticated
`supabase-js` client pointed at this project's anon key cannot subscribe
to a `presence:city:*` topic even if it bypasses this app's own client
code entirely. (Unverified against a live project — see §6's own caveat.)

### Deanonymization risks

The payload (`{ cell }`) carries no identity, no account linkage, and no
cross-session correlator. The worst a peer can learn about any single
other explorer is "someone, currently connected, is within ~4.9km of this
point" — which is materially the same information this app's own HUD
already displays about the *current visitor* (`env.city`) today. Nothing
new is exposed about any individual that the app didn't already expose
about itself.

## 3–4. Location privacy enforcement (not just policy)

- `encodeGeohash` (`lib/geohash.ts`) is the *only* function in the codebase
  permitted to see a raw lat/lon for this feature; its output is lossy by
  construction (same cell for any point within ~4.9km, no reverse
  function that recovers the original point — `decodeGeohashCenter` only
  ever recovers the cell's *center*, used solely for this doc's own
  verification tests, not by any rendering code).
- `engine/usePresence.ts` computes `cell` once from `lat`/`lon` and never
  passes the raw values anywhere else — confirmed by
  `engine/usePresence.test.tsx`'s explicit assertion that the tracked
  payload's serialized form never contains the test fixture's raw
  coordinate substrings.
- The rendered UI (`PresenceField.tsx`) does not even read `cell` — it only
  ever receives a `count` from the hook. Precise coordinates cannot leak
  through API responses, browser events, logs, or client-side state for
  this feature, because they are never passed into any of those paths
  past `encodeGeohash`'s one call site.

## 5. Session lifecycle

| Requirement | Implementation |
|---|---|
| Explicit start | Join only when `enabled` (caller passes `awake`, mirroring how every other non-critical subsystem defers until after the planetary intro), tab visible, Supabase configured, session active, and a geohash cell is known. |
| Explicit end | Effect cleanup always `untrack()`s (if tracked) then `unsubscribe()`s — on unmount, on `enabled` flipping false, on the city/cell changing, and on the tab going hidden. |
| Heartbeat/expiry | None of our own — Supabase Realtime Presence's built-in disconnect detection is the expiry mechanism; there is no custom heartbeat table or TTL to get wrong. |
| Cleanup on leave | Same as "explicit end" above. |
| Stale-presence expiration | Not a custom concept here — presence is tied to a live socket; there is no "stale but still tracked" state possible by construction. |
| Visibility-aware updates | `useIsPageVisible` (internal to `engine/usePresence.ts`) fully leaves the channel while `document.visibilityState !== "visible"` and rejoins when it returns — no background Realtime socket activity while the tab is hidden. |
| Reconnect handling | Supabase's `RealtimeClient` auto-reconnects the underlying socket; this hook re-`track()`s on every `SUBSCRIBED` callback, which fires again after a reconnect-triggered rejoin — verified by `engine/usePresence.test.tsx`'s explicit reconnect test (`CHANNEL_ERROR` → `SUBSCRIBED` → `track()` called a second time). |
| Realtime unavailable | `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` all resolve to `status: "unavailable"`; no custom retry loop is layered on top of the library's own backoff. |

## 6. Authentication and authorization

Reuses the existing identity architecture exactly — no new auth concept:

- Client-side: `engine/usePresence.ts` calls `supabase.auth.getSession()`
  before ever creating a channel; no session → `status: "unavailable"`,
  no channel created, no network request beyond the session check.
- Server-side: the new migration enables RLS on `realtime.messages` (the
  table Supabase's Realtime Authorization feature checks before allowing a
  private channel's subscribe/broadcast) with two policies scoped to the
  `presence:city:%` topic pattern, both restricted to the `authenticated`
  role (which anonymous-sign-in sessions are members of — they are not
  the separate, broader `anon` role).
- The client always creates the channel with `config: { private: true }`,
  which is what makes `supabase-js` actually submit to server-side RLS
  instead of using the legacy public-channel path that skips it entirely.

**Not verified against a live database or Supabase project** — same
limitation as the existing `SUP-1`/`SUP-2` migrations
(`docs/environment.md`): no hosted project is linked here and the local
Docker daemon needed for `supabase start` isn't running in this sandbox.
The migration is implemented and internally consistent with Supabase's
documented Realtime Authorization mechanism, reviewed against this
project's existing migration conventions, but its actual enforcement
against a running Postgres + Realtime server has not been exercised.
**Required before any live traffic**: apply the migration to a real
project and manually verify an unauthenticated client is rejected and an
authenticated one succeeds, per the migration file's own verification
checklist.

RLS was not weakened anywhere to make this feature work — no existing
policy was touched; this migration only adds new policies on a
previously-unmanaged table.

## 7. User experience

- **Visual**: `components/organism/PresenceField.tsx` — a small, capped
  (max 6) cluster of soft, low-opacity glowing motes rendered inside the
  existing map container, alongside (not inside) `NeuralMap`. `NeuralMap.tsx`
  itself was not touched.
- **Deliberately not bearing/distance-mapped** (see deviations below) — the
  motes' positions are a fixed decorative scatter around the visitor's own
  nucleus, driven only by *how many* motes to show, never by *where* any
  other explorer actually is. This is a stronger privacy property than the
  original plan's "randomized offset within the cell" (RTP-3), and reads as
  more clearly abstract, not less.
- **No fake "online" claim**: the component renders nothing at all —
  no motes, no screen-reader announcement — unless `connected` is true
  *and* `othersCount > 0`. A disconnected/misconfigured state looks
  identical to "no one else is here," which is the correct, honest
  degradation (the alternative, showing a visible "presence unavailable"
  banner, would draw more attention to an optional ambient feature than it
  deserves).
- **Accessibility**: an `aria-live="polite"` region announces
  `t("presence.nearby", { n })` in the visitor's own language whenever the
  count is nonzero — independent of the canvas/CSS visual, so a
  screen-reader user gets equivalent information.
- **Reduced motion**: `reducedMotion` (from `env.prefersReducedMotion`)
  omits the `ee-breathe` animation class on each mote — static dots instead
  of a drifting cluster.
- **Mobile**: pure CSS (percentage-based positions, 6px dots), no
  WebGL/canvas work added — negligible overhead on any device.
- **Demo vs. live**: there is no simulated/demo presence path anywhere in
  the shipped component or hook — `othersCount` only ever comes from a real
  Supabase Realtime Presence state. The only place fabricated presence data
  exists is inside this feature's own tests (`engine/usePresence.test.tsx`,
  `components/organism/PresenceField.test.tsx`), which mock the Supabase
  client entirely and are never shipped to a browser. This satisfies "never
  create fake live users in production" by construction — there is no
  toggle to accidentally leave on.

## 8. Testing — what's mocked vs. what's live

**Everything in this phase is verified with mocks; nothing against a live
Supabase project** (none is linked in this sandbox — see §6). Each test
file states this inline; summarized here:

| File | Tests | What it verifies |
|---|---|---|
| `lib/geohash.test.ts` | 8 | Encoding determinism, coarse-bucketing (nearby points collide, distant ones don't), the documented ~4.9km cell size, resilience to malformed input |
| `lib/presence.test.ts` | 10 | City-slug normalization/fallback, channel topic naming, defensive payload parsing against untrusted/adversarial input |
| `engine/usePresence.test.tsx` | 10 | Session init (private channel, correct topic), coarse-location enforcement (tracked payload is `{cell}` only, raw coordinates never appear), unauthorized-access guard (no session → never joins), graceful Supabase-unconfigured degradation, join/leave counting, channel-error degradation, reconnect re-tracking, cleanup on unmount, disabled/no-location gates, unknown-city fallback |
| `components/organism/PresenceField.test.tsx` | 7 | No fake "online" rendering when disconnected, silence when alone, aria-live announcement content, the 6-mote cap, reduced-motion class omission, non-interactive/hidden-from-a11y-tree mote layer |

**Explicitly not covered by automated tests** (would require a live
Supabase Realtime server): the actual RLS enforcement in
`supabase/migrations/20261019000000_presence_realtime_authorization.sql`,
real cross-client propagation latency, and genuine socket-level
reconnect/backoff behavior (the reconnect test above simulates the
*callback* a reconnect produces, not a real dropped TCP connection).

## Deviations from the original RTP-1/2/3 plan — and why

Re-derived against this session's brief rather than implemented as
originally sketched in `IMPLEMENTATION_PLAN.md`:

1. **No custom `ephemeralId`.** The original plan generates a random
   client-side UUID per tab session as the presence key. Supabase's own
   per-connection presence ref already *is* exactly that — ephemeral,
   unlinkable, rotates on reconnect — and inventing a second one would
   only add a value to validate and reason about for no privacy gain.
   Removing it is a smaller attack surface, not a missing feature.
2. **No bearing/distance-mapped sparks.** `RTP-3` proposed rendering each
   present cell at "a randomized offset within the cell," implying the
   cell's approximate real-world bearing and distance from the visitor is
   visually encoded. This session's brief is more emphatic about avoiding
   anything that could read as a surveillance map ("Assess whether
   repeated updates could reveal movement or identity") — so the shipped
   version renders only a count-driven decorative scatter with **no
   geographic meaning at all**, which cannot leak direction or distance
   even in principle, and is simpler to build, test, and review.
   `cell` is still computed and still the only thing ever broadcast (for
   the data-minimization reason in §1), it's just not used for placement.
3. **Explicit Realtime Authorization migration added.** `RTP-2`'s original
   plan says "no auth required to join by design." This session's brief
   explicitly requires verifying authorization for every subscription —
   reconciled by requiring *a* session (anonymous sign-in satisfies it),
   not a *specific* identity, which keeps the "anonymous explorer" framing
   intact while still closing the fully-unauthenticated-scraper gap `RTP-2`
   left open.
4. **City-level channel scoping kept** from `RTP-2`, geohash bucketing kept
   from `RTP-1` (for the payload, not the channel key) — both still used,
   just not for the same purpose `RTP-1` originally assigned to the cell
   (rendering placement, now purely count-based instead).
