/**
 * i18n completeness checker CLI (I18-1). Run: npm run i18n:check
 * Exits non-zero (fails CI) if any language has a missing key.
 */
import { DICTIONARIES, LANGS, type Lang } from "../lib/i18n";
import { checkCompleteness } from "./i18n-report";

const langs = LANGS.map((l) => l.code);
const report = checkCompleteness(DICTIONARIES, langs);

let hasMissing = false;
for (const lang of langs) {
  if (lang === "en") continue;
  const { missing, suspect } = report[lang];
  if (missing.length === 0 && suspect.length === 0) {
    console.log(`✓ ${lang}: complete (${Object.keys(DICTIONARIES[lang as Lang]).length} keys)`);
    continue;
  }
  if (missing.length) {
    hasMissing = true;
    console.log(`✗ ${lang}: ${missing.length} missing key(s)`);
    for (const k of missing) console.log(`    missing: ${k}`);
  }
  if (suspect.length) {
    console.log(`! ${lang}: ${suspect.length} key(s) identical to English (possibly untranslated)`);
    for (const k of suspect) console.log(`    suspect: ${k} = "${DICTIONARIES.en[k]}"`);
  }
}

if (hasMissing) {
  console.error("\ni18n check failed: one or more languages have missing keys.");
  process.exit(1);
}
console.log("\ni18n check passed: no missing keys in any language.");
