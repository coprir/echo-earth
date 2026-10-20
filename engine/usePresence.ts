"use client";

import { useEffect, useState } from "react";
import { hasSupabaseClient } from "@/lib/env.client";
import { encodeGeohash } from "@/lib/geohash";
import { presenceTopic, type PresencePayload } from "@/lib/presence";
import type { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

/**
 * Realtime explorer presence (RTP-1/2 in IMPLEMENTATION_PLAN.md,
 * docs/realtime-presence.md has the full threat model). Joins a
 * per-city Supabase Realtime Presence channel and reports only a *count*
 * of other currently-connected explorers — never their identity, never
 * their coordinates, never a history of either.
 *
 * Privacy properties, enforced here (not just documented):
 *   - the only payload ever sent is `{ cell }`, a geohash (lib/geohash.ts)
 *     ~4.9km × 4.9km bucket — the visitor's real lat/lon never leaves this
 *     hook.
 *   - no identifier is generated or persisted by this app — Supabase's own
 *     per-connection presence ref (ephemeral, rotates every reconnect) is
 *     the only "who" the channel ever has, and this hook never reads or
 *     exposes it.
 *   - requires an active Supabase session (anonymous or real) before
 *     joining — reuses the existing identity architecture
 *     (engine/useSupabaseSession.ts) rather than inventing a new one, and
 *     is the client-side half of the server-side Realtime Authorization
 *     policy in supabase/migrations/*_presence_realtime_authorization.sql
 *     (requires `authenticated`, i.e. *some* session, not a specific
 *     identity).
 *   - fully leaves the channel while the tab is hidden and rejoins when
 *     visible again — no background realtime activity while unseen.
 *   - fails open: unconfigured Supabase, no session, or any channel error
 *     all resolve to "unavailable" — never a crash, never a fake count.
 */

export type PresenceStatus = "disabled" | "connecting" | "connected" | "unavailable";

export interface UsePresenceInput {
  /** Caller-controlled gate — e.g. only once the organism is "awake." */
  enabled: boolean;
  lat: number | null;
  lon: number | null;
  city: string | null;
  country: string | null;
}

export interface UsePresenceResult {
  status: PresenceStatus;
  /** Other explorers currently present in the same city channel — never includes this visitor. */
  othersCount: number;
}

function useIsPageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export function usePresence({ enabled, lat, lon, city, country }: UsePresenceInput): UsePresenceResult {
  const [status, setStatus] = useState<PresenceStatus>("disabled");
  const [othersCount, setOthersCount] = useState(0);
  const visible = useIsPageVisible();

  const cell = lat != null && lon != null ? encodeGeohash(lat, lon) : null;
  const topic = presenceTopic(city, country);
  const active = enabled && visible && hasSupabaseClient && cell !== null;

  useEffect(() => {
    if (!active) {
      setStatus(enabled ? (hasSupabaseClient ? "connecting" : "unavailable") : "disabled");
      setOthersCount(0);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let tracked = false;

    setStatus("connecting");

    (async () => {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowserClient();
      if (!supabase || cancelled) {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      // Never join on behalf of an unauthenticated connection — mirrors the
      // server-side Realtime Authorization policy, which only authorizes
      // the `authenticated` role (anonymous sign-ins included).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setStatus("unavailable");
        return;
      }

      const ch = supabase.channel(topic, {
        config: { private: true, presence: { enabled: true } },
      });
      channel = ch;

      const recomputeCount = () => {
        const state = ch.presenceState();
        const total = Object.keys(state).length;
        setOthersCount(Math.max(0, total - (tracked ? 1 : 0)));
      };

      ch.on("presence", { event: "sync" }, recomputeCount);
      ch.on("presence", { event: "join" }, recomputeCount);
      ch.on("presence", { event: "leave" }, recomputeCount);

      ch.subscribe((subStatus: REALTIME_SUBSCRIBE_STATES) => {
        if (cancelled) return;
        if (subStatus === "SUBSCRIBED") {
          setStatus("connected");
          ch
            .track({ cell } satisfies PresencePayload)
            .then(() => {
              tracked = true;
              recomputeCount();
            })
            .catch(() => {
              // tracking failed (e.g. the authorization policy rejected
              // it) — stay "connected" to the channel but report zero
              // others rather than guessing
              tracked = false;
            });
        } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT" || subStatus === "CLOSED") {
          setStatus("unavailable");
          setOthersCount(0);
        }
        // no explicit retry loop on error — the underlying RealtimeClient
        // already reconnects the socket with its own backoff, and a
        // successful reconnect fires this callback again with SUBSCRIBED
      });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        if (tracked) void channel.untrack();
        void channel.unsubscribe();
      }
    };
    // `cell`/`topic` are derived every render from lat/lon/city/country —
    // re-join only when the *values* they're derived from actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cell, topic]);

  return { status, othersCount };
}
