// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ConciergeRequestSchema } from "./types";

describe("lib/ai/types", () => {
  it("never imports a runtime value from lib/i18n.ts (only `import type`)", () => {
    // Regression guard: this file is imported by a genuinely server-only
    // route (app/api/concierge). lib/i18n.ts carries a top-level
    // "use client" directive, and pulling a runtime value (e.g. `LANGS`)
    // from a "use client" module into server-only code breaks under
    // Next's RSC bundler at build time — `next build` threw
    // "LANGS.map is not a function" even though `tsc --noEmit` and the
    // full vitest suite both saw no problem, since neither understands
    // the "use client" boundary. A plain `import type { Lang } from
    // "@/lib/i18n"` is fine (erased at compile time); any non-type
    // import of a value from that module is the regression this guards.
    const src = fs.readFileSync(path.resolve(__dirname, "types.ts"), "utf8");
    const valueImportFromI18n = /^import\s+(?!type\s)[^;]*from\s+["']@\/lib\/i18n["']/m;
    expect(valueImportFromI18n.test(src)).toBe(false);
  });

  it("accepts the real set of language codes lib/i18n.ts supports", () => {
    const valid = ConciergeRequestSchema.safeParse({
      energy: "calm",
      language: "tr", // one of the less-common codes, not just "en"
      local: true,
      city: null,
      country: null,
      weatherKind: "clear",
      tempC: 20,
      phase: "day",
      season: "summer",
      mode: "explore",
      travel: "still",
      favorites: [],
      candidates: [
        { id: "a", name: "Place", category: "cafes", rating: 4, priceLevel: 2, openNow: true, distanceM: 100, isGem: false },
      ],
    });
    expect(valid.success).toBe(true);
  });
});
