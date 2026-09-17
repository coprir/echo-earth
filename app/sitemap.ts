import type { MetadataRoute } from "next";

/**
 * The site is a single living surface — one canonical entry point.
 * Kept deliberately minimal so search engines index the root cleanly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://echoearthh.com";
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
