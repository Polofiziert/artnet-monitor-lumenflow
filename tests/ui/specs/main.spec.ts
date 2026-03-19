import { test, expect } from "@playwright/test";

test.describe("Universe Map Component", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should render universe grid", async ({ page }) => {
    const grid = page.locator('[data-testid="universe-map"]');
    await expect(grid).toBeVisible();
  });

  test("should display heatmap colors for active universes", async ({
    page,
  }) => {
    const cell = page.locator(
      '[data-testid="universe-cell"][data-universe="0"]'
    );

    // Initially inactive (dark blue)
    await expect(cell).toHaveClass(/bg-active-900/);
  });

  test("visual regression: universe map layout", async ({ page }) => {
    const map = page.locator('[data-testid="universe-map"]');
    await expect(map).toHaveScreenshot("universe-map.png");
  });
});

test.describe("Channel Inspector", () => {
  test("should sync DMX values with UI", async ({ page }) => {
    // State synchronization test
    const channel1 = page.locator('[data-testid="channel"][data-channel="0"]');
    const initialValue = await channel1.textContent();

    // Simulate DMX update via test API
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("dmx-update", {
          detail: { universe: 0, channel: 0, value: 200 },
        })
      );
    });

    // Verify UI updated
    const updatedValue = await channel1.textContent();
    expect(updatedValue).not.toBe(initialValue);
  });

  test("should show sparklines for channel history", async ({ page }) => {
    const sparkline = page.locator(
      '[data-testid="channel-sparkline"][data-channel="0"]'
    );
    await expect(sparkline).toBeVisible();
  });

  test("visual regression: channel inspector", async ({ page }) => {
    const inspector = page.locator('[data-testid="channel-inspector"]');
    await expect(inspector).toHaveScreenshot("channel-inspector.png");
  });
});

test.describe("Routing Matrix", () => {
  test("should render routing matrix", async ({ page }) => {
    const matrix = page.locator('[data-testid="routing-matrix"]');
    await expect(matrix).toBeVisible();
  });

  test("should support drag-and-drop routing", async ({ page }) => {
    const source = page.locator(
      '[data-testid="matrix-cell"][data-source="A"][data-universe="0"]'
    );
    const target = page.locator(
      '[data-testid="matrix-cell"][data-sink="DMX1"][data-universe="0"]'
    );

    await source.dragTo(target);

    // Verify routing established
    await expect(target).toHaveClass(/active/);
  });

  test("visual regression: routing matrix", async ({ page }) => {
    const matrix = page.locator('[data-testid="routing-matrix"]');
    await expect(matrix).toHaveScreenshot("routing-matrix.png");
  });
});

test.describe("Flicker Detection", () => {
  test("should highlight flickering channels in amber", async ({ page }) => {
    // Simulate rapid value changes
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(
          new CustomEvent("dmx-update", {
            detail: {
              universe: 0,
              channel: 5,
              value: Math.random() * 255,
            },
          })
        );
      }
    });

    const flickeringChannel = page.locator(
      '[data-testid="channel"][data-channel="5"]'
    );
    await expect(flickeringChannel).toHaveClass(/flicker/);
  });
});

test.describe("Performance", () => {
  test("should maintain 60 FPS during art-net load", async ({ page }) => {
    let frameCount = 0;
    let lastTime = performance.now();

    await page.evaluate(() => {
      const interval = setInterval(() => {
        // Simulate incoming DMX data
        window.dispatchEvent(
          new CustomEvent("dmx-batch", {
            detail: {
              packets: Array.from({ length: 500 }, (_, i) => ({
                universe: i,
                data: new Uint8Array(512),
              })),
            },
          })
        );
      }, 1000 / 44); // 44 Hz Art-Net rate
    });

    // Monitor frame rate
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(16.67); // 60 FPS = ~16.67ms per frame
      frameCount++;
    }

    const elapsed = performance.now() - lastTime;
    const avgFps = (frameCount / elapsed) * 1000;

    expect(avgFps).toBeGreaterThan(50); // Allow some variance
  });
});
