import { describe, expect, it } from "vitest";
import { DICTIONARIES, LANGS } from "../lib/i18n";
import { checkCompleteness } from "./i18n-report";

describe("i18n completeness", () => {
  const langs = LANGS.map((l) => l.code);
  const report = checkCompleteness(DICTIONARIES, langs);

  it("has no missing keys in any supported language", () => {
    for (const [lang, { missing }] of Object.entries(report)) {
      expect(missing, `${lang} is missing: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("flags narrator/journey namespaces specifically (the areas most likely to drift)", () => {
    const narratorAndJourneyKeys = Object.keys(DICTIONARIES.en).filter(
      (k) => k.startsWith("nar.") || k.startsWith("journey.") || k.startsWith("atmo.")
    );
    expect(narratorAndJourneyKeys.length).toBeGreaterThan(0);
    for (const [lang, { missing }] of Object.entries(report)) {
      const gaps = missing.filter((k) => k.startsWith("nar.") || k.startsWith("journey.") || k.startsWith("atmo."));
      expect(gaps, `${lang} is missing narrator/journey/atmosphere keys: ${gaps.join(", ")}`).toEqual([]);
    }
  });

  it("supports exactly the languages the docs should claim (not 8 — verify the real count)", () => {
    expect(LANGS.map((l) => l.code).sort()).toEqual(["ar", "de", "el", "en", "es", "fr", "ru", "tr", "zh"]);
  });
});
