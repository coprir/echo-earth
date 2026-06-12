import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://echoearthh.com"),
  title: "ECHO EARTH — a living digital organism",
  description:
    "A sentient digital ecosystem that senses your city, weather, season and motion — and grows the world around you. Discover what's near you through a living neural map.",
  openGraph: {
    title: "ECHO EARTH",
    description: "A living digital organism that discovers your city as it discovers you.",
    url: "https://echoearthh.com",
    siteName: "ECHO EARTH",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06040f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh`}>{children}</body>
    </html>
  );
}
