/**
 * Pure i18n completeness logic (I18-1 in IMPLEMENTATION_PLAN.md), split from
 * the CLI entry point (check-i18n.ts) so it's importable from tests without
 * triggering any CLI side effects.
 *
 * `en` is the dictionary's source of truth. For every other language, report:
 *   - missing: a key `en` has that this language doesn't
 *   - suspect: a non-English value that's byte-identical to English for a
 *     string of more than a few characters (likely an untranslated
 *     copy-paste rather than an intentionally-shared short token)
 */
import type { Lang } from "../lib/i18n";

const SUSPECT_MIN_LENGTH = 4; // short tokens (e.g. "OK", city names) can legitimately match

export interface LanguageReport {
  missing: string[];
  suspect: string[];
}

export function checkCompleteness(
  dicts: Readonly<Record<Lang, Record<string, string>>>,
  langs: Lang[]
): Record<string, LanguageReport> {
  const enKeys = Object.keys(dicts.en);
  const report: Record<string, LanguageReport> = {};

  for (const lang of langs) {
    if (lang === "en") continue;
    const dict = dicts[lang];
    const missing = enKeys.filter((k) => !(k in dict));
    const suspect = enKeys.filter(
      (k) => k in dict && dict[k] === dicts.en[k] && dicts.en[k].length >= SUSPECT_MIN_LENGTH
    );
    report[lang] = { missing, suspect };
  }
  return report;
}
