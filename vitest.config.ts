import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, ".") };

// Two separate projects (own Vite server, own resolve conditions) — not
// cosmetic. `server-only`'s package.json exports map is:
//   { ".": { "react-server": "./empty.js", "default": "./index.js" } }
// It only resolves to the no-op `empty.js` when the resolver explicitly
// requests Next's custom "react-server" condition (set by Next's own
// bundler when compiling a real Server Component). Nothing else — not
// Node, not "environment: node", not jsdom vs. node — changes that; without
// the condition, `import "server-only"` throws unconditionally. So:
//   - the "node" project adds `"react-server"` to both `resolve.conditions`
//     (client-graph resolution) and `ssr.resolve.conditions` (the one that
//     actually governs vite-node/Vitest's own module loading — the two are
//     genuinely separate Vite config surfaces, and only the `ssr.*` one
//     affects how Vitest resolves a test file's own imports) — simulating
//     "imported from inside a real Next.js server context." This is what
//     lets lib/env.server.ts, lib/log.ts, and lib/supabase/server.ts load
//     normally for their logic tests.
//   - the "jsdom" project deliberately does NOT add that condition, so
//     `server-only` throws exactly as it would in a real client bundle —
//     the *.client-guard.test.ts files assert on that throw on purpose.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias, conditions: ["react-server"] },
        ssr: { resolve: { conditions: ["react-server"] } },
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["**/*.test.{ts,tsx}"],
          exclude: [
            "node_modules",
            ".next",
            "tests/e2e/**",
            "components/**/*.test.tsx",
            "engine/**/*.test.ts",
            "**/*.client-guard.test.ts",
          ],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          // "engine/**" tests are jsdom by default: engine/*.ts modules are
          // all "use client" browser-sensor code (window, navigator,
          // AudioContext, localStorage), so DOM globals are the common case.
          include: ["components/**/*.test.tsx", "engine/**/*.test.ts", "**/*.client-guard.test.ts"],
          exclude: ["node_modules", ".next"],
        },
      },
    ],
  },
});
