import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Twitter/X card image — same content as app/opengraph-image.tsx. Not a
 * bare re-export: Next's metadata-route webpack loader needs `size`/
 * `contentType` as statically-analyzable literal exports in *this* file
 * to generate the correct <meta name="twitter:image:width/height"> tags
 * reliably in dev mode (confirmed: a `export { size, contentType, default }
 * from "./opengraph-image"` re-export produced a real "export not found"
 * webpack warning under `next dev`, even though the route still served
 * correctly under `next build` — not worth the risk of relying on that).
 * Small, deliberate duplication over a correctness/stability tradeoff.
 */
export default function TwitterImage() {
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
