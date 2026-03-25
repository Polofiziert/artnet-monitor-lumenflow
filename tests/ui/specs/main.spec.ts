import { test, expect } from "@playwright/test";

test.describe("Inspector Suite Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("dashboard shows universe map", async ({ page }) => {
    const map = page.locator('[data-testid="universe-map"]');
    await expect(map).toBeVisible();

    const canvas = map.locator("canvas");
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test("inspector view shows channel inspector", async ({ page }) => {
    // On mobile the search input can intercept pointer events while clicking tabs.
    // Blur it and click using the tab's stable test id.
    const searchInput = page.locator('[data-testid="search-input"]');
    if (await searchInput.isVisible()) await searchInput.blur();

    await page.locator('[data-testid="tab-inspector"]').click({ force: true });

    const inspector = page.locator('[data-testid="channel-inspector"]');
    await expect(inspector).toBeVisible();

    // Channel inspector is rendered via a canvas-based grid.
    const canvas = inspector.locator("canvas");
    await expect(canvas).toBeVisible();
  });

  test("routing matrix view shows routing matrix", async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"]');
    if (await searchInput.isVisible()) await searchInput.blur();

    // Mobile tab clicks can be unreliable due to pointer interception.
    // The app registers keyboard shortcuts; "3" switches to routing.
    await page.keyboard.press("3");

    const matrix = page.locator('[data-testid="routing-matrix"]');
    await expect(matrix).toBeVisible({ timeout: 10000 });
  });
});
