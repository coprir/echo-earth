import type { MetadataRoute } from "next";

/**
 * Let crawlers read the whole experience, but keep the internal
 * API routes out of the index — they return data, not pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: "https://echoearthh.com/sitemap.xml",
    host: "https://echoearthh.com",
  };
}
