"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, hasSupabaseClient } from "@/lib/env.client";

/**
 * Browser Supabase client — anon key only, RLS-enforced. Safe to import from
 * any "use client" component. Returns null when Supabase isn't configured
 * (no env vars set) so callers can skip persistence features gracefully,
 * matching the rest of the app's "fail open, demo mode always works" design.
 */
let cached: ReturnType<typeof createBrowserClient> | null | undefined;

export function getSupabaseBrowserClient() {
  if (cached !== undefined) return cached;
  if (!hasSupabaseClient) {
    cached = null;
    return cached;
  }
  cached = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return cached;
}
