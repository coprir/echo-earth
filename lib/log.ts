import "server-only";

/**
 * Minimal structured server logging — one JSON line per event to stdout
 * (captured natively by Vercel and most platforms). Deliberately tiny: no
 * external dependency, no PII. Never pass raw IP, exact lat/lon, API keys, or
 * full request bodies as fields — only coarse, non-identifying context.
 */

type Level = "info" | "warn" | "error";

export interface LogFields {
  route: string;
  branch: string; // e.g. "live", "echo", "error:401", "rate_limited"
  [key: string]: string | number | boolean | undefined;
}

// Field names that commonly carry PII/secrets — logging one is almost always
// a mistake (use a coarser field instead, e.g. "city" not "lat"/"lon").
const DISALLOWED_KEYS = /^(lat|lon|lng|latitude|longitude|ip|ipaddress|email|password|token|apikey|api_key|key|secret)$/i;

function write(level: Level, fields: LogFields) {
  for (const k of Object.keys(fields)) {
    if (DISALLOWED_KEYS.test(k)) {
      throw new Error(`lib/log: refusing to log disallowed field "${k}" (likely PII/secret)`);
    }
  }
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (fields: LogFields) => write("info", fields),
  warn: (fields: LogFields) => write("warn", fields),
  error: (fields: LogFields) => write("error", fields),
};
