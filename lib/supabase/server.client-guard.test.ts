import { describe, expect, it } from "vitest";

// Same technique as env.server.client-guard.test.ts: the "jsdom" project
// omits the "react-server" resolve condition, so `server-only` throws here
// exactly as it would in a real client bundle — proving the service-role
// Supabase client can't be pulled into one.
describe("supabase server client import guard", () => {
  it("throws when resolved under a browser-like condition", async () => {
    await expect(import("./server")).rejects.toThrow(/Client Component/);
  });
});
