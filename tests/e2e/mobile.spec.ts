import { test, expect, devices } from "@playwright/test";

/**
 * Mobile layout smoke test — loads the real app at a phone viewport
 * (iPhone 12 dimensions/UA/touch emulation) and confirms the critical
 * chrome (HUD, Concierge orb) is visible and reachable, and that nothing
 * overflows horizontally — the same structural-overflow proxy
 * tests/e2e/rtl.spec.ts already uses, applied to a narrow viewport instead
 * of a mirrored one. Deliberately takes only the iPhone 12 preset's
 * viewport/UA/touch fields, not its `defaultBrowserType: "webkit"` — this
 * repo only has the Chromium browser installed (see playwright.config.ts),
 * and Chromium's own mobile emulation is faithful enough for a layout
 * smoke test.
 */
const { defaultBrowserType: _defaultBrowserType, ...iPhone12Emulation } = devices["iPhone 12"];
void _defaultBrowserType;
test.use({ ...iPhone12Emulation });

test("critical chrome is visible and the layout doesn't overflow at phone width", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  const englishOption = page.getByRole("option", { name: "English" });
  await expect(englishOption).toBeVisible();
  await englishOption.click();

  await expect(page.locator('[aria-label="Discovery field"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Open the AI city concierge" })).toBeVisible({ timeout: 20000 });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);

  expect(errors).toEqual([]);
});
