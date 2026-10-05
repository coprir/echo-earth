// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { log } from "./log";

describe("log", () => {
  it("writes a JSON line to stdout for info", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info({ route: "/api/places", branch: "live" });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", route: "/api/places", branch: "live" });
    expect(typeof parsed.time).toBe("string");
    spy.mockRestore();
  });

  it("routes errors to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error({ route: "/api/weather", branch: "error:timeout" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("refuses to log disallowed PII/secret-shaped field names", () => {
    expect(() => log.info({ route: "/api/geo", branch: "ip", lat: 1.23 } as never)).toThrow(/disallowed/);
    expect(() => log.info({ route: "/api/places", branch: "live", apiKey: "x" } as never)).toThrow(/disallowed/);
  });
});
