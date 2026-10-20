import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseAdmin } from "@/lib/env.server";

/**
 * Server-only Supabase client using the service-role key — bypasses RLS
 * entirely. Only ever call this from `app/api/**` route handlers or
 * `supabase/functions/**`, never from anything reachable by client code (the
 * `server-only` import makes an accidental client-bundle inclusion a build
 * error). Returns null when not configured, so routes can fall back to
 * their existing demo/stateless behavior instead of crashing.
 */
let cached: ReturnType<typeof createClient> | null | undefined;

export function getSupabaseAdminClient() {
  if (cached !== undefined) return cached;
  if (!hasSupabaseAdmin) {
    cached = null;
    return cached;
  }
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
