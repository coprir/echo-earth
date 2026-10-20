"use client";

import { useEffect } from "react";
import { hasSupabaseClient } from "@/lib/env.client";

/**
 * Bootstraps a Supabase Anonymous Sign-in session once per browser (SUP-1 in
 * IMPLEMENTATION_PLAN.md) — this is what gives every visitor a real, non
 * -null `auth.uid()` that the fixed RLS policies
 * (supabase/migrations/20261005232553_fix_anonymous_visitor_rls.sql) key on.
 *
 * No-ops entirely when Supabase isn't configured (no env vars set) — and
 * critically, the `@supabase/ssr` SDK is never even fetched in that case
 * (checked here, before the dynamic import below), not just unused: every
 * current visitor has no Supabase project configured, so this keeps that
 * ~70kB dependency out of their bundle entirely rather than lazy-loading it
 * for no reason. Also requires "Anonymous Sign-ins" to be enabled in the
 * Supabase project's Auth settings — a dashboard toggle, not something any
 * migration or client code can turn on — see docs/environment.md.
 */
export function useSupabaseSession() {
  useEffect(() => {
    if (!hasSupabaseClient) return;

    let cancelled = false;
    (async () => {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowserClient();
      if (!supabase || cancelled) return;

      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return; // returning visitor — session already persisted
      const { error } = await supabase.auth.signInAnonymously();
      if (error && !cancelled) {
        // Fail open: Supabase-backed features (memory sync, saved places)
        // simply stay unavailable this session; demo mode is unaffected.
        console.warn("[useSupabaseSession] anonymous sign-in failed:", error.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
