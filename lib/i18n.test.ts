import { describe, expect, it } from "vitest";
import { DICTIONARIES, LANGS, dirOf, langFromCountry, langFromNavigator, translate } from "./i18n";

describe("translate", () => {
  it("returns the key's value in the requested language", () => {
    expect(translate("fr", "hud.mood")).toBe(DICTIONARIES.fr["hud.mood"]);
  });

  it("falls back to the raw key when missing everywhere (never renders blank)", () => {
    // real dictionaries have zero gaps (enforced by
    // scripts/i18n-report.test.ts), so there's no naturally-occurring
    // "present in English, missing in French" key to exercise that middle
    // fallback step in isolation without mutating the shared DICTIONARIES
    // object — this exercises the outermost (both-missing) fallback, which
    // is the one every language shares the same code path for.
    expect(translate("fr", "__definitely_not_a_real_key__")).toBe("__definitely_not_a_real_key__");
    expect(translate("en", "__definitely_not_a_real_key__")).toBe("__definitely_not_a_real_key__");
  });

  it("interpolates {vars} into the translated string", () => {
    const out = translate("en", "con.whisper", { city: "Paris", n: 3, lead: "Aurora Beans" });
    expect(out).toContain("Paris");
    expect(out).toContain("3");
    expect(out).toContain("Aurora Beans");
    expect(out).not.toContain("{city}");
  });

  it("replaces every occurrence of a repeated placeholder (uses replaceAll, not replace)", () => {
    // no dictionary entry matches this "key" — translate() falls through to
    // returning the key itself, which is a convenient literal string to run
    // the {var} interpolation against directly
    const out = translate("en", "{x} and {x} again", { x: "Z" });
    expect(out).toBe("Z and Z again");
  });
});

describe("dirOf", () => {
  it("is rtl only for Arabic", () => {
    for (const l of LANGS) {
      expect(dirOf(l.code)).toBe(l.code === "ar" ? "rtl" : "ltr");
    }
  });
});

describe("langFromCountry", () => {
  it("returns null with no country", () => {
    expect(langFromCountry(null)).toBeNull();
    expect(langFromCountry(undefined)).toBeNull();
  });

  it("maps a known country to its language", () => {
    expect(langFromCountry("FR")).toBe("fr");
    expect(langFromCountry("de")).toBe("de"); // case-insensitive
    expect(langFromCountry("SA")).toBe("ar");
  });

  it("falls back to null (→ English) for an unmapped country", () => {
    expect(langFromCountry("US")).toBeNull();
  });

  it("distinguishes Northern Cyprus (Turkish) from the rest of Cyprus (Greek) by city", () => {
    expect(langFromCountry("CY")).toBe("el"); // no city → southern/default Greek
    expect(langFromCountry("CY", "Nicosia")).toBe("el");
    expect(langFromCountry("CY", "Kyrenia")).toBe("tr");
    expect(langFromCountry("CY", "GIRNE")).toBe("tr"); // case-insensitive city match
  });
});

describe("langFromNavigator", () => {
  it("returns null outside a browser (SSR-safe) — this test caught a real bug: Node 18+ ships its own global `navigator` (navigator.language defaults to the OS locale), so a guard on `typeof navigator === \"undefined\"` silently returns the server's locale instead of null; the fix guards on `window` instead, matching the SSR-detection idiom already used elsewhere (engine/useEnvironment.ts's detectDevice)", () => {
    expect(typeof window).toBe("undefined"); // sanity: confirms this really is the server-side case being guarded against
    expect(typeof navigator).not.toBe("undefined"); // Node's own built-in navigator — the exact trap this guard must not fall into
    expect(langFromNavigator()).toBeNull();
  });
});

describe("LANGS / DICTIONARIES shape", () => {
  it("every supported language has a dir and a non-empty label", () => {
    for (const l of LANGS) {
      expect(["ltr", "rtl"]).toContain(l.dir);
      expect(l.label.length).toBeGreaterThan(0);
      expect(DICTIONARIES[l.code]).toBeTruthy();
    }
  });
});
