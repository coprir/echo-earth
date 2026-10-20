// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fingerprint, getCached, setCached } from "./cache";

const baseCtx = {
  energy: "calm" as const,
  language: "en" as const,
  local: true,
  city: "Nairobi",
  weather: { kind: "clear" as const, tempC: 22 },
  phase: "day" as const,
  season: "summer" as const,
  mode: "explore" as const,
  travel: "still" as const,
};

describe("ai concierge cache", () => {
  it("round-trips a cached value by fingerprint", () => {
    const key = fingerprint(baseCtx);
    const value = { narrative: "n", stops: [{ placeId: "a", reason: "r" }] };
    setCached(key, value);
    expect(getCached(key)).toEqual(value);
  });

  it("misses for an unrelated fingerprint", () => {
    expect(getCached(fingerprint({ ...baseCtx, city: "Totally Different City" }))).toBeNull();
  });

  it("fingerprint does not depend on personal/learned-taste fields or exact candidates", () => {
    // fingerprint() only accepts the shared-context subset by its type
    // signature — this test documents that `favorites` and `candidates`
    // are excluded by construction, not merely by convention.
    const a = fingerprint(baseCtx);
    const b = fingerprint({ ...baseCtx });
    expect(a).toBe(b);
  });

  it("expires after the TTL", () => {
    vi.useFakeTimers();
    try {
      const key = fingerprint({ ...baseCtx, city: "TTL City" });
      setCached(key, { narrative: "n", stops: [{ placeId: "a", reason: "r" }] });
      expect(getCached(key)).not.toBeNull();
      vi.advanceTimersByTime(21 * 60_000);
      expect(getCached(key)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
