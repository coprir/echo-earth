import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("env.server", () => {
  it("imports the server-only guard as its first real statement", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "env.server.ts"), "utf8");
    expect(src.trimStart().startsWith('import "server-only"')).toBe(true);
  });

  it("loads with no env vars set (full demo mode) and exposes every key as undefined", async () => {
    const prev = { ...process.env };
    for (const k of [
      "GOOGLE_MAPS_API_KEY",
      "OPENWEATHER_API_KEY",
      "ANTHROPIC_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]) delete process.env[k];

    const { env, hasSupabaseAdmin } = await import("./env.server");
    expect(env.GOOGLE_MAPS_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(hasSupabaseAdmin).toBe(false);

    process.env = prev;
  });
});
