/**
 * SEC-4 in IMPLEMENTATION_PLAN.md: confirms server-only secret *values*
 * (not names — NEXT_PUBLIC_-prefixed names appearing in client code is
 * expected and fine) never leak into the client-reachable build output
 * (.next/static/, the only directory a browser ever fetches from). Run
 * after `next build`, with the server-only env vars
 * below actually set to real (or CI-only dummy) values — run against a
 * build where none of them were set, this check can't prove anything,
 * since there'd be no secret value to look for in the first place.
 *
 * Usage: `vite-node scripts/checkSecretsInBundle.ts` after `npm run build`,
 * with SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY / OPENWEATHER_API_KEY /
 * GOOGLE_MAPS_API_KEY set (CI sets short, recognizable dummy values for
 * exactly this check — see .github/workflows/ci.yml).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

const SERVER_ONLY_VARS = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "OPENWEATHER_API_KEY", "GOOGLE_MAPS_API_KEY"];

// Directories whose contents are actually shipped to (or reachable by) a
// browser. `.next/server/**` is never sent to the client directly — it's
// the Node runtime's own server-side bundle — so it's deliberately out of
// scope here (checking it would also false-positive on e.g. GOOGLE_MAPS_API_KEY,
// which legitimately stays server-only too but is validated server-side).
const CLIENT_REACHABLE_DIRS = [".next/static"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const root = process.cwd();
  const checkedVars = SERVER_ONLY_VARS.filter((v) => process.env[v]);

  if (checkedVars.length === 0) {
    console.log("checkSecretsInBundle: no server-only secret env vars are set — nothing to check against (this is expected in full demo mode; CI sets dummy values specifically to exercise this check).");
    return;
  }

  const files = CLIENT_REACHABLE_DIRS.flatMap((d) => walk(path.join(root, d)));
  const leaked: { file: string; varName: string }[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // binary/unreadable file — never a text-embedded secret
    }
    for (const varName of checkedVars) {
      const value = process.env[varName]!;
      if (value.length >= 6 && content.includes(value)) {
        leaked.push({ file: path.relative(root, file), varName });
      }
    }
  }

  if (leaked.length > 0) {
    console.error("checkSecretsInBundle: FAILED — secret value(s) found in client-reachable build output:");
    for (const l of leaked) console.error(`  ${l.varName} in ${l.file}`);
    process.exit(1);
  }

  console.log(`checkSecretsInBundle: passed — checked ${checkedVars.join(", ")} against ${files.length} client-reachable build file(s), no leak found.`);
}

main();
