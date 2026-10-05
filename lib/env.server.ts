import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Importing this from a "use client" component is a
 * build-time error (via the `server-only` package), so secrets here can never
 * reach the browser bundle. Every key is optional — ECHO EARTH must keep
 * working in full demo mode with zero environment variables set.
 */

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalKey = () => z.preprocess(blankToUndefined, z.string().min(1).optional());

const schema = z.object({
  GOOGLE_MAPS_API_KEY: optionalKey(),
  OPENWEATHER_API_KEY: optionalKey(),
  ANTHROPIC_API_KEY: optionalKey(),
  SUPABASE_SERVICE_ROLE_KEY: optionalKey(),
  // not secret, but read server-side for the service-role client
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid server environment variables:\n${details}`);
}

export const env = parsed.data;

/** True once both Supabase pieces needed for a service-role client are present. */
export const hasSupabaseAdmin = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
