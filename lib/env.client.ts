import { z } from "zod";

/**
 * Client-safe environment. Only `NEXT_PUBLIC_*` values belong here — nothing
 * in this file is or ever should be a secret, since it ships in the browser
 * bundle by design (Next.js inlines `NEXT_PUBLIC_*` at build time).
 */

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalKey = () => z.preprocess(blankToUndefined, z.string().min(1).optional());

const schema = z.object({
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalKey(),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalKey(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid client environment variables:\n${details}`);
}

export const env = parsed.data;

/** True once both pieces needed for a browser Supabase client are present. */
export const hasSupabaseClient = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
