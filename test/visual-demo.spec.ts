import { test } from "../src/plugin/fixture";
import * as path from "path";

/**
 * StageMask Demo Tests
 *
 * This file demonstrates two ways to use visual snapshot testing:
 *
 * 1. `visualSnapshot` (Hard Assertion)
 *    - Throws immediately when a screenshot doesn't match
 *    - Test stops at the first failure
 *    - Use when you need to fail fast
 *
 * 2. `softVisualSnapshot` (Soft Assertion)
 *    - Collects all failures without stopping the test
 *    - All failures are reported at the end
 *    - Use when you want to see all screenshot failures in one run
 *
 * To add masks for dynamic content:
 * 1. Run tests to generate failures: `npx playwright test`
 * 2. Open the mask editor: `npx stagemask review`
 * 3. Draw masks over dynamic content (timestamps, IDs, counters)
 * 4. Save masks and re-run tests
 */

test.describe("Hard Assertions (visualSnapshot)", () => {
  test.beforeEach(async ({ page }) => {
    const testPagePath = path.join(__dirname, "test-page.html");
    await page.goto(`file://${testPagePath}`);
    await page.waitForSelector(".cards-grid");
  });

  test("dashboard card - stops on first failure", async ({
    page,
    visualSnapshot,
  }) => {
    // This uses visualSnapshot which throws immediately on failure.
    // If this screenshot fails, the test stops here and the next
    // visualSnapshot call won't execute.

    await visualSnapshot("hard-dashboard-card.png", {
      element: page.locator('[data-testid="dashboard-card"]'),
    });
  });

  test("profile card - stops on first failure", async ({
    page,
    visualSnapshot,
  }) => {
    await visualSnapshot("hard-profile-card.png", {
      element: page.locator('[data-testid="profile-card"]'),
    });
  });
});

test.describe("Soft Assertions (softVisualSnapshot)", () => {
  test.beforeEach(async ({ page }) => {
    const testPagePath = path.join(__dirname, "test-page.html");
    await page.goto(`file://${testPagePath}`);
    await page.waitForSelector(".cards-grid");
  });

  test("all cards - continues after failures", async ({
    page,
    softVisualSnapshot,
  }) => {
    // This uses softVisualSnapshot which collects failures without stopping.
    // All screenshots will be taken even if some fail, and you'll see
    // all failures in the review UI after one test run.

    // Dashboard card - has timestamp and random ID (will fail without masks)
    await softVisualSnapshot("soft-dashboard-card.png", {
      element: page.locator('[data-testid="dashboard-card"]'),
    });

    // Profile card - has visit counter (will fail without masks)
    await softVisualSnapshot("soft-profile-card.png", {
      element: page.locator('[data-testid="profile-card"]'),
    });

    // Activity card - has dynamic timestamps (will fail without masks)
    await softVisualSnapshot("soft-activity-card.png", {
      element: page.locator('[data-testid="activity-card"]'),
    });

    // Notifications card - has UUID (will fail without masks)
    await softVisualSnapshot("soft-notifications-card.png", {
      element: page.locator('[data-testid="notifications-card"]'),
    });

    // Full page screenshot
    await softVisualSnapshot("soft-full-page.png");

    // All failures (if any) will be thrown at the end of the test
  });

  test("multiple screenshots in sequence", async ({
    page,
    softVisualSnapshot,
  }) => {
    // Another example: taking multiple screenshots of the same element
    // after different interactions

    await softVisualSnapshot("soft-initial-state.png");

    // Click refresh button
    await page.click('button:has-text("Refresh")');
    await page.waitForTimeout(100);

    await softVisualSnapshot("soft-after-refresh.png");
  });
});

test.describe("Mixed Assertions", () => {
  test.beforeEach(async ({ page }) => {
    const testPagePath = path.join(__dirname, "test-page.html");
    await page.goto(`file://${testPagePath}`);
    await page.waitForSelector(".cards-grid");
  });

  test("combining hard and soft assertions", async ({
    page,
    visualSnapshot,
    softVisualSnapshot,
  }) => {
    // You can mix both types in the same test.
    // Use soft for non-critical screenshots and hard for critical ones.

    // Soft assertions - continue even if these fail
    await softVisualSnapshot("mixed-dashboard.png", {
      element: page.locator('[data-testid="dashboard-card"]'),
    });

    await softVisualSnapshot("mixed-profile.png", {
      element: page.locator('[data-testid="profile-card"]'),
    });

    // Hard assertion - this is critical, stop if it fails
    // (In real tests, this might be your most important screenshot)
    await visualSnapshot("mixed-critical-full-page.png");

    // These won't run if the hard assertion above fails
    await softVisualSnapshot("mixed-activity.png", {
      element: page.locator('[data-testid="activity-card"]'),
    });
  });
});
