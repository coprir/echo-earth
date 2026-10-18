import { test, expect } from "@playwright/test";

/**
 * Structural RTL check (IMPLEMENTATION_PLAN.md's I18-2): loads the app,
 * picks Arabic from the language gate, and asserts the document actually
 * switches to `dir="rtl"` and nothing overflows horizontally — a cheap,
 * reliable proxy for "a physical left/right CSS leak broke the mirrored
 * layout," without having to assert on exact pixel positions of every
 * HUD widget.
 */
test("Arabic selection flips the document to RTL with no horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const arabicOption = page.getByRole("option", { name: "العربية" });
  await expect(arabicOption).toBeVisible();
  await arabicOption.click();

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  // give the field (map canvas, HUD, concierge auto-open timers) a moment
  // to finish mounting before measuring layout
  await page.waitForTimeout(1500);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  // a couple of px of tolerance for scrollbar/subpixel rounding, not a real leak
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
});
