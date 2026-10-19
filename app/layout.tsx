import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://echoearthh.com"),
  title: "ECHO EARTH — a living digital organism",
  description:
    "A sentient digital ecosystem that senses your city, weather, season and motion — and grows the world around you. Discover what's near you through a living neural map.",
  alternates: {
    // single canonical entry point by design (ARCHITECTURE.md §8) — one
    // explicit link rather than relying on crawlers inferring it
    canonical: "/",
  },
  openGraph: {
    title: "ECHO EARTH",
    description: "A living digital organism that discovers your city as it discovers you.",
    url: "https://echoearthh.com",
    siteName: "ECHO EARTH",
    type: "website",
    // image itself comes from the app/opengraph-image.tsx file convention —
    // Next.js injects the og:image tags automatically, nothing to list here
  },
  twitter: {
    card: "summary_large_image",
    title: "ECHO EARTH",
    description: "A living digital organism that discovers your city as it discovers you.",
    // image comes from app/twitter-image.tsx (re-exports the same generated
    // image as opengraph-image.tsx) via the same automatic file convention
  },
};

export const viewport: Viewport = {
  themeColor: "#06040f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Minimal WebApplication structured data (SEO-3 in IMPLEMENTATION_PLAN.md —
// WebApplication over generic WebSite since this is an interactive app, not
// a content/article site) — only facts already stated elsewhere in this
// file (name, url, description) plus an honest categorical description
// (TravelApplication), never a fabricated rating, review, or business
// detail. Static, developer-authored JSON with zero interpolated or
// user-derived content, which is the one standard, safe use case for
// dangerouslySetInnerHTML (JSON-LD has no other way to reach <head>) — the
// only such usage in this codebase, deliberately.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ECHO EARTH",
  url: "https://echoearthh.com",
  description: "A sentient digital ecosystem that senses your city, weather, season and motion — and grows the world around you.",
  applicationCategory: "TravelApplication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh`}>
        <ErrorBoundary
          fallback={
            <main className="grid min-h-dvh place-items-center bg-[#06040f] px-6 text-center text-white/70">
              <p className="text-sm tracking-wide">
                the organism lost its signal —{" "}
                {/* a real anchor, not next/link: this must force a full browser
                    reload to clear whatever React state threw, not a client-side
                    route transition that could leave the same broken state */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className="underline">
                  reload
                </a>
              </p>
            </main>
          }
        >
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
