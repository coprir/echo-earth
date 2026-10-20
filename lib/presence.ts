/**
 * Shared constants/helpers for the realtime explorer-presence feature
 * (RTP-1/2 in IMPLEMENTATION_PLAN.md). Kept separate from engine/usePresence.ts
 * so the pure logic (channel naming, payload shape, validation) is testable
 * without a Supabase client or any DOM.
 */

/** The only thing ever broadcast per visitor — see docs/realtime-presence.md. */
export interface PresencePayload {
  /** A geohash cell (lib/geohash.ts), never raw coordinates. */
  cell: string;
}

const MAX_SLUG_LEN = 60;

/**
 * City+country → a stable channel-name fragment. Deliberately coarse and
 * already non-sensitive — this app already displays the city in its HUD
 * (VitalsHUD) today; nothing new is exposed by using it as a channel key.
 * Falls back to a constant "unknown" bucket rather than refusing to join,
 * matching the app's "fail open, never block the experience" design.
 */
export function citySlug(city: string | null, country: string | null): string {
  const raw = [city, country].filter(Boolean).join("-") || "unknown";
  const slug = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN);
  return slug || "unknown";
}

/** The Realtime Presence channel topic for a city — scopes who hears whom. */
export function presenceTopic(city: string | null, country: string | null): string {
  return `presence:city:${citySlug(city, country)}`;
}

/**
 * Defensive parse of whatever a Presence payload actually contains — this
 * data comes from other visitors' browsers over a channel this app's own
 * server never validates at write time (Realtime Presence has no
 * server-side schema), so it must never be trusted. Returns null for
 * anything that isn't a well-formed, in-range cell string; callers only
 * ever need a *count* of valid entries, never the raw payload.
 */
export function parsePresencePayload(raw: unknown): PresencePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const cell = (raw as Record<string, unknown>).cell;
  if (typeof cell !== "string") return null;
  if (cell.length < 1 || cell.length > 12) return null; // sanity bound, not a real geohash length check
  if (!/^[0-9a-z]+$/.test(cell)) return null;
  return { cell };
}
