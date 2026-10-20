import { test, expect } from "@playwright/test";

/**
 * Structural reduced-motion check: with the OS "prefers-reduced-motion"
 * preference emulated, the app must still load and reach the main field
 * without errors — framer-motion's MotionConfig (app/page.tsx) and
 * engine/environment.ts's resolveTheme both react to this preference, and
 * this is a cheap proxy that neither path throws or hangs under it. Avoids
 * asserting on exact animation timing/values (brittle) — just "does it
 * still work."
 */
test("the app loads and reaches the main field with prefers-reduced-motion active", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  const englishOption = page.getByRole("option", { name: "English" });
  await expect(englishOption).toBeVisible();
  await englishOption.click();

  // the discovery field carries a stable aria-label (t("field.aria")) once
  // the organism wakes — reaching it confirms the gate → planetary entry →
  // main field sequence completed without throwing, under reduced motion
  await expect(page.locator('[aria-label="Discovery field"]')).toBeVisible({ timeout: 15000 });

  expect(errors).toEqual([]);
});
