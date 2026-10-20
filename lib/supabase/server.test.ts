// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";

describe("supabase server client", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("returns null (not throws) when Supabase env vars are unset", async () => {
    const { getSupabaseAdminClient } = await import("./server");
    expect(getSupabaseAdminClient()).toBeNull();
  });
});
