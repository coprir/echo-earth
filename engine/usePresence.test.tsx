import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { usePresence as UsePresenceFn, UsePresenceInput, UsePresenceResult } from "./usePresence";

const getSessionMock = vi.fn();
const channelMock = vi.fn();

function makeFakeChannel() {
  const handlers: Record<string, () => void> = {};
  let subscribeCb: ((status: string) => void) | null = null;
  const presenceState: Record<string, unknown> = {};

  const channel = {
    on: vi.fn((_type: string, filter: { event: string }, cb: () => void) => {
      handlers[filter.event] = cb;
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subscribeCb = cb;
      return channel;
    }),
    track: vi.fn(async (payload: { cell: string }) => {
      void payload;
      presenceState["self-ref"] = [{}];
      handlers.sync?.();
      return { status: "ok" };
    }),
    untrack: vi.fn(async () => ({ status: "ok" })),
    unsubscribe: vi.fn(async () => ({ status: "ok" })),
    presenceState: vi.fn(() => presenceState),
    // test helpers, not part of the real supabase-js API
    __emitSubscribe: (status: string) => subscribeCb?.(status),
    __addOther: () => {
      presenceState[`peer-${Object.keys(presenceState).length}`] = [{}];
      handlers.join?.();
    },
    __removeOther: (key: string) => {
      delete presenceState[key];
      handlers.leave?.();
    },
  };
  return channel;
}

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: { getSession: getSessionMock },
    channel: channelMock,
  })),
}));

const baseInput: UsePresenceInput = { enabled: true, lat: 48.8566, lon: 2.3522, city: "Paris", country: "FR" };

/** Fresh import per test — `usePresence.ts` reads the module-level, import-time-frozen `hasSupabaseClient` from lib/env.client.ts, so env vars set in beforeEach only take effect on a freshly re-evaluated module (same pattern as engine/useSupabaseSession.test.tsx). */
async function freshUsePresence(): Promise<typeof UsePresenceFn> {
  const mod = await import("./usePresence");
  return mod.usePresence;
}

function makeHarness(usePresence: typeof UsePresenceFn, onResult: (r: UsePresenceResult) => void) {
  return function Harness({ input }: { input: UsePresenceInput }) {
    const result = usePresence(input);
    onResult(result);
    return null;
  };
}

describe("usePresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "anon-123" } } } });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("joins a private, per-city channel and tracks only a coarse geohash cell — never raw coordinates", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();

    const latest = { current: null as UsePresenceResult | null };
    const Harness = makeHarness(usePresence, (r) => { latest.current = r; });
    render(<Harness input={baseInput} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalledTimes(1));
    expect(channelMock).toHaveBeenCalledWith("presence:city:paris-fr", {
      config: { private: true, presence: { enabled: true } },
    });

    act(() => fake.__emitSubscribe("SUBSCRIBED"));
    await waitFor(() => expect(fake.track).toHaveBeenCalledTimes(1));

    const payload = fake.track.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["cell"]);
    expect(typeof payload.cell).toBe("string");
    expect(payload.cell).toHaveLength(5);
    expect(JSON.stringify(payload)).not.toContain("48.8566");
    expect(JSON.stringify(payload)).not.toContain("2.3522");

    await waitFor(() => expect(latest.current?.status).toBe("connected"));
  });

  it("never joins without an active session (unauthorized-access guard)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const usePresence = await freshUsePresence();
    const latest = { current: null as UsePresenceResult | null };
    const Harness = makeHarness(usePresence, (r) => { latest.current = r; });
    render(<Harness input={baseInput} />);

    await waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(1));
    expect(channelMock).not.toHaveBeenCalled();
    await waitFor(() => expect(latest.current?.status).toBe("unavailable"));
  });

  it("never connects when Supabase isn't configured — disabled, not an error, and the SDK is never touched", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const usePresence = await freshUsePresence();
    const latest = { current: null as UsePresenceResult | null };
    const Harness = makeHarness(usePresence, (r) => { latest.current = r; });
    render(<Harness input={baseInput} />);

    expect(channelMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(latest.current?.status).toBe("unavailable");
  });

  it("reports zero others initially, and counts peers joining/leaving without ever exposing their payload", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();
    const latest = { current: null as UsePresenceResult | null };
    const Harness = makeHarness(usePresence, (r) => { latest.current = r; });
    render(<Harness input={baseInput} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalled());
    act(() => fake.__emitSubscribe("SUBSCRIBED"));
    await waitFor(() => expect(latest.current?.othersCount).toBe(0));

    act(() => fake.__addOther());
    await waitFor(() => expect(latest.current?.othersCount).toBe(1));

    act(() => fake.__addOther());
    await waitFor(() => expect(latest.current?.othersCount).toBe(2));

    act(() => fake.__removeOther("peer-1"));
    await waitFor(() => expect(latest.current?.othersCount).toBe(1));
  });

  it("degrades gracefully on a channel/realtime failure — no crash, status becomes unavailable", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();
    const latest = { current: null as UsePresenceResult | null };
    const Harness = makeHarness(usePresence, (r) => { latest.current = r; });
    render(<Harness input={baseInput} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalled());
    act(() => fake.__emitSubscribe("CHANNEL_ERROR"));
    await waitFor(() => expect(latest.current?.status).toBe("unavailable"));
    expect(latest.current?.othersCount).toBe(0);
  });

  it("re-tracks after a reconnect (a second SUBSCRIBED callback on the same channel)", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();
    const Harness = makeHarness(usePresence, () => {});
    render(<Harness input={baseInput} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalled());
    act(() => fake.__emitSubscribe("SUBSCRIBED"));
    await waitFor(() => expect(fake.track).toHaveBeenCalledTimes(1));

    act(() => fake.__emitSubscribe("CHANNEL_ERROR"));
    act(() => fake.__emitSubscribe("SUBSCRIBED")); // simulated reconnect
    await waitFor(() => expect(fake.track).toHaveBeenCalledTimes(2));
  });

  it("leaves the channel on unmount (session cleanup)", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();
    const Harness = makeHarness(usePresence, () => {});
    const { unmount } = render(<Harness input={baseInput} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalled());
    act(() => fake.__emitSubscribe("SUBSCRIBED"));
    await waitFor(() => expect(fake.track).toHaveBeenCalledTimes(1));

    unmount();
    await waitFor(() => expect(fake.untrack).toHaveBeenCalledTimes(1));
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not join when disabled by the caller", async () => {
    const usePresence = await freshUsePresence();
    const Harness = makeHarness(usePresence, () => {});
    render(<Harness input={{ ...baseInput, enabled: false }} />);
    expect(channelMock).not.toHaveBeenCalled();
  });

  it("does not join when location is unknown (lat/lon not yet resolved)", async () => {
    const usePresence = await freshUsePresence();
    const Harness = makeHarness(usePresence, () => {});
    render(<Harness input={{ ...baseInput, lat: null, lon: null }} />);
    expect(channelMock).not.toHaveBeenCalled();
  });

  it("falls back to a constant city bucket rather than refusing to join when city/country are unknown", async () => {
    const fake = makeFakeChannel();
    channelMock.mockReturnValue(fake);
    const usePresence = await freshUsePresence();
    const Harness = makeHarness(usePresence, () => {});
    render(<Harness input={{ ...baseInput, city: null, country: null }} />);

    await waitFor(() => expect(channelMock).toHaveBeenCalledWith("presence:city:unknown", expect.anything()));
  });
});
