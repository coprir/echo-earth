import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social preview image (SEO/metadata audit, Phase 10) — generated at build
 * time via Next's `next/og` convention, so there's nothing to keep in sync
 * by hand and no fabricated marketing claims: it reuses exactly the same
 * name/tagline wording already in app/layout.tsx's `metadata`, rendered in
 * the organism's own palette (deep background, the accent glow color used
 * throughout the live app's CSS variables).
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(120% 120% at 50% 0%, #140b26 0%, #06040f 100%)",
          color: "#f3eefb",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#b48cf2",
            boxShadow: "0 0 60px 20px rgba(180,140,242,0.55)",
            marginBottom: 36,
          }}
        />
        <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: 14, textTransform: "uppercase" }}>echo earth</div>
        <div style={{ fontSize: 28, marginTop: 20, color: "rgba(243,238,251,0.72)", letterSpacing: 1 }}>
          a living digital organism
        </div>
      </div>
    ),
    { ...size }
  );
}
