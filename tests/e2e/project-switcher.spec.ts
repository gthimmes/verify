import { test, expect, type Page } from "@playwright/test";

/**
 * E2E for the global project switcher in the app header.  Confirms it reflects
 * the project implied by the current route and can jump to another project.
 */

async function gotoAcmeCases(page: Page) {
  await page.goto("/?list=1");
  await page.locator('[data-project-key="ACM"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases/);
}

test("header switcher shows the active project and switches", async ({ page }) => {
  await gotoAcmeCases(page);

  const switcher = page.getByTestId("project-switcher");
  await expect(switcher).toContainText("ACM");

  // Open, filter, and jump to the Internal (INT) project.
  await switcher.click();
  await page.getByTestId("project-switcher-filter").fill("INT");
  const option = page.locator(
    '[data-testid="project-switcher-option"][data-project-key="INT"]',
  );
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases/);
  await expect(page.getByTestId("project-switcher")).toContainText("INT");
});
