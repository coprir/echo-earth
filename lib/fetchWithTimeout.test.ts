import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves normally when the underlying fetch resolves before the timeout", async () => {
    const response = new Response("ok");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWithTimeout("https://example.test", {}, 5000);
    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("aborts and rejects if the underlying fetch doesn't resolve within the timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const pending = fetchWithTimeout("https://example.test", {}, 1000);
      const assertion = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
