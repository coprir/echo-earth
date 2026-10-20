import { describe, expect, it, vi } from "vitest";
import { checkRateLimit, clientKey } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows requests under the limit and decrements remaining", () => {
    const key = `test-${Math.random()}`;
    const a = checkRateLimit(key, 3, 60_000);
    const b = checkRateLimit(key, 3, 60_000);
    const c = checkRateLimit(key, 3, 60_000);
    expect(a).toMatchObject({ allowed: true, remaining: 2 });
    expect(b).toMatchObject({ allowed: true, remaining: 1 });
    expect(c).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("rejects once the limit is exceeded within the window", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 1, 60_000);
    const second = checkRateLimit(key, 1, 60_000);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    try {
      const key = `test-${Math.random()}`;
      checkRateLimit(key, 1, 1000);
      expect(checkRateLimit(key, 1, 1000).allowed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(checkRateLimit(key, 1, 1000).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    checkRateLimit(keyA, 1, 60_000);
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  function reqWith(headers: Record<string, string>) {
    return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } };
  }

  it("prefers the first x-forwarded-for entry", () => {
    expect(clientKey(reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(reqWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' with no identifying headers", () => {
    expect(clientKey(reqWith({}))).toBe("unknown");
  });
});
