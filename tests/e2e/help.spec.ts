import { test, expect } from "@playwright/test";

/**
 * E2E for the in-app help center (help-navigator widget mounted in the root
 * layout).  Playwright locators pierce the widget's shadow root automatically.
 * These tests only visit routes that render without seed data (/?list=1,
 * /search, /runs), so they never skip.
 */

test.describe("help center", () => {
  test("launcher opens contextual help; context follows the route", async ({ page }) => {
    await page.goto("/?list=1");

    await page.getByRole("button", { name: "Open help" }).click();
    const panel = page.getByRole("dialog", { name: "Verify Help" });
    await expect(panel.getByText("Suggested for this page")).toBeVisible();
    await expect(
      panel.getByText("Projects: creating, switching, archiving"),
    ).toBeVisible();
    await expect(panel.getByText("Browse by topic")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel.getByText("Browse by topic")).not.toBeVisible();

    // The suggested articles follow the route: /runs is about run lifecycle.
    await page.goto("/runs");
    await page.keyboard.press("F1");
    await expect(panel.getByText("Run lifecycle and progress")).toBeVisible();
    await expect(panel.getByText("Creating a run")).toBeVisible();
  });

  test("search, article rendering, feedback, and back navigation", async ({ page }) => {
    await page.goto("/?list=1");
    await page.keyboard.press("F1");
    const panel = page.getByRole("dialog", { name: "Verify Help" });

    await panel.getByPlaceholder("Search help articles…").fill("snapshot");
    await expect(panel.locator("mark").first()).toBeVisible();
    await panel.locator("button.hn-item", { hasText: "Creating a run" }).click();
    await expect(panel.getByRole("heading", { name: "Creating a run" })).toBeVisible();
    await expect(panel.getByText("Choosing cases")).toBeVisible();

    await panel.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(panel.getByText("Thanks for the feedback!")).toBeVisible();

    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel.locator("mark").first()).toBeVisible(); // back on search results
  });

  test("category browsing drills into execution help", async ({ page }) => {
    await page.goto("/?list=1");
    await page.keyboard.press("F1");
    const panel = page.getByRole("dialog", { name: "Verify Help" });

    await panel.locator("button.hn-item", { hasText: "Execution & results" }).click();
    await expect(
      panel.getByText("Recording pass/fail/blocked/skipped, defects, and attempts."),
    ).toBeVisible();
    await panel.locator("button.hn-item", { hasText: "Executing tests" }).click();
    await expect(panel.getByText("Recording a result")).toBeVisible();
    await expect(panel.locator(".hn-article").getByText(/Per-step results/)).toBeVisible();

    await panel.getByRole("button", { name: "Back" }).click();
    await panel.getByRole("button", { name: "Back" }).click();
    await expect(panel.getByText("Browse by topic")).toBeVisible();
  });
});
