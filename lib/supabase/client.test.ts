import { describe, expect, it, beforeEach } from "vitest";

describe("supabase browser client", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns null (not throws) when Supabase env vars are unset", async () => {
    const { getSupabaseBrowserClient } = await import("./client");
    expect(getSupabaseBrowserClient()).toBeNull();
  });
});
