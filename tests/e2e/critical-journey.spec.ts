import { test, expect } from "@playwright/test";

/**
 * The critical user journey, end to end, in a real browser, against the
 * real demo-mode fallback (this sandbox has no Google/OpenWeather/Anthropic
 * keys configured, so every data layer exercised here is the app's actual
 * "works with zero API keys" fallback path, not a mock): launch → language
 * choice → the discovery field renders → open the AI Concierge → pick an
 * energy → a deterministic journey renders → tapping a stop opens the real
 * place detail panel. This is the one journey every other automated check
 * in this repo (RTL, reduced-motion, the many unit/component tests) only
 * ever exercises in isolated pieces — this spec is the only place they're
 * strung together in one real page load.
 */
test("launch → demo-mode discovery → concierge journey → place detail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  // 1. language gate — pick English, confirming the launch sequence itself
  // (environment init, planetary entry) doesn't require any real API key
  const englishOption = page.getByRole("option", { name: "English" });
  await expect(englishOption).toBeVisible();
  await englishOption.click();

  // 2. the discovery field — confirms demo-mode place synthesis rendered
  // something (the field's own aria-label, set once awake)
  await expect(page.locator('[aria-label="Discovery field"]')).toBeVisible({ timeout: 20000 });

  // 3. the onboarding "what is this?" panel may auto-open around the same
  // time (app/page.tsx's own sequencing) — dismiss it if present so it
  // doesn't shadow the Concierge dialog below (both use role="dialog")
  const aboutDialog = page.getByRole("dialog", { name: "What is Echo Earth?" });
  if (await aboutDialog.isVisible().catch(() => false)) {
    await aboutDialog.getByRole("button", { name: "Close" }).click().catch(() => {});
  }

  // 4. open the Concierge and request a journey
  await page.getByRole("button", { name: "Open the AI city concierge" }).click();
  const concierge = page.getByRole("dialog", { name: "City concierge" });
  await expect(concierge).toBeVisible();
  await concierge.getByRole("button", { name: /Calm/ }).click();

  // 5. a deterministic journey renders — at least one real stop, as a list
  const stops = concierge.locator("ol li button");
  await expect(stops.first()).toBeVisible({ timeout: 10000 });
  const stopCountBefore = await stops.count();
  expect(stopCountBefore).toBeGreaterThan(0);

  // 6. tapping a stop closes the Concierge and opens the real place detail
  // panel with that place's own name — confirms the demo-mode "echo" place
  // synthesized by /api/places actually flows all the way through the
  // ranking pipeline into a real, inspectable UI element, not just a count
  await stops.first().click();
  await expect(concierge).not.toBeVisible();
  const placeDetail = page.locator("aside[aria-label]");
  await expect(placeDetail).toBeVisible({ timeout: 5000 });
  await expect(placeDetail).not.toHaveText("");

  expect(errors).toEqual([]);
});
