import { test, expect } from "@playwright/test";

/**
 * SEO-1/SEO-2/SEO-3 in IMPLEMENTATION_PLAN.md's own acceptance criteria —
 * verified against the real running app (not just by reading source):
 * the generated OG/Twitter image actually serves as an image, and the
 * structured-data script tag actually contains valid, schema-shaped JSON.
 */
test("the generated OG image responds with a real image", async ({ request }) => {
  const res = await request.get("/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const body = await res.body();
  expect(body.length).toBeGreaterThan(1000); // not an empty/broken response
});

test("the generated Twitter-card image responds with a real image", async ({ request }) => {
  const res = await request.get("/twitter-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("the root page carries valid, schema.org-shaped JSON-LD structured data", async ({ page }) => {
  await page.goto("/");
  const jsonText = await page.locator('script[type="application/ld+json"]').textContent();
  expect(jsonText).toBeTruthy();
  const data = JSON.parse(jsonText!);
  expect(data["@context"]).toBe("https://schema.org");
  expect(data["@type"]).toBe("WebApplication");
  expect(typeof data.name).toBe("string");
  expect(data.name.length).toBeGreaterThan(0);
  expect(typeof data.url).toBe("string");
});

test("the root page carries a canonical link and Twitter/OG card metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /echoearthh\.com/);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(1);
});
