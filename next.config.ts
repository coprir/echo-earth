import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin tracing to this app — the parent home dir has an unrelated lockfile
  outputFileTracingRoot: path.join(__dirname),

  // Baseline security headers (Phase 10 hardening audit). Deliberately not
  // a Content-Security-Policy here: this app dynamically loads Google Maps'
  // own script (components/map/LivingMap.tsx) and Next's own inline hydration
  // scripts, so a correct CSP needs real browser testing against every
  // code path (incl. the Google Maps JS SDK's own sub-requests) before it
  // ships — tracked as a follow-up, not attempted blind in this pass.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation stays allowed (self) — engine/useEnvironment.ts's
          // GPS upgrade path needs it; everything else this app never uses
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
