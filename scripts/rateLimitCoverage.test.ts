import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * SEC-2 in IMPLEMENTATION_PLAN.md: closes the rate-limiting coverage audit
 * as a real, CI-enforced check (not just a one-time manual confirmation) —
 * every API route must import lib/rateLimit.ts, or be explicitly
 * allow-listed here with a written reason. A future route that forgets
 * rate limiting fails this test, not just a human review.
 */

// Any route that legitimately doesn't need rate limiting goes here, with a
// reason — never silently skip a route.
const ALLOWLIST: Record<string, string> = {};

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("every API route is rate-limited (or explicitly allow-listed)", () => {
  const apiDir = path.resolve(__dirname, "..", "app", "api");
  const routes = findRouteFiles(apiDir);

  it("found at least one route to check (the check itself isn't silently a no-op)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    const rel = path.relative(path.resolve(__dirname, ".."), route).replace(/\\/g, "/");
    it(`${rel} imports lib/rateLimit, or is allow-listed`, () => {
      if (ALLOWLIST[rel]) {
        expect(ALLOWLIST[rel].length).toBeGreaterThan(0); // the reason isn't blank
        return;
      }
      const source = readFileSync(route, "utf8");
      expect(source).toMatch(/from ["']@\/lib\/rateLimit["']/);
    });
  }
});
