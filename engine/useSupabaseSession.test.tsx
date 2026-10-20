import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const getSessionMock = vi.fn();
const signInAnonymouslyMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: { getSession: getSessionMock, signInAnonymously: signInAnonymouslyMock },
  })),
}));

describe("useSupabaseSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("no-ops entirely (never even imports the Supabase SDK) when unconfigured", async () => {
    const { useSupabaseSession } = await import("./useSupabaseSession");
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    function Harness() {
      useSupabaseSession();
      return null;
    }
    render(<Harness />);
    expect(getSupabaseBrowserClient).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it("signs in anonymously when configured and there's no existing session", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    getSessionMock.mockResolvedValue({ data: { session: null } });
    signInAnonymouslyMock.mockResolvedValue({ error: null });

    const { useSupabaseSession } = await import("./useSupabaseSession");
    function Harness() {
      useSupabaseSession();
      return null;
    }
    render(<Harness />);
    await vi.waitFor(() => expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1));
  });

  it("does not sign in again when a session already exists (returning visitor)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "existing" } } } });

    const { useSupabaseSession } = await import("./useSupabaseSession");
    function Harness() {
      useSupabaseSession();
      return null;
    }
    render(<Harness />);
    await vi.waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(1));
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });
});
