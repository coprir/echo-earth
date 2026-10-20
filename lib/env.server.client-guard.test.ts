import { describe, expect, it } from "vitest";

// Matched to vitest.config.ts's "jsdom" project (by this file's
// *.client-guard.test.ts name), which deliberately omits the "react-server"
// resolve condition — so `server-only` resolves to its throwing default
// export, exactly as it would for a module reachable from a real client
// bundle. This is a real regression guard for the security property
// FND-2/SEC-4 depend on: importing lib/env.server.ts from client-reachable
// code fails loudly instead of silently shipping a secret.
describe("env.server client-import guard", () => {
  it("throws when resolved under a browser-like condition", async () => {
    await expect(import("./env.server")).rejects.toThrow(/Client Component/);
  });
});
