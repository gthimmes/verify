import { test, expect, type Page } from "@playwright/test";

/**
 * E2E for the team-maturity features: CSV export affordances, the bulk-select
 * toolbar, saved filters, and the version-history viewer.  Assumes the Acme
 * seed fixture is present (same as golden-paths).
 *
 * These tests are deliberately non-destructive to the shared seed: they assert
 * UI wiring and use additive actions (creating a uniquely-named saved filter).
 * The mutating bulk paths are covered by the Go store/handler tests.
 */

async function gotoAcmeCases(page: Page): Promise<string> {
  await page.goto("/?list=1");
  await page.locator('[data-project-key="ACM"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases/);
  const base = new URL(page.url()).pathname; // /projects/{id}/cases
  // The list is lazy — apply a filter so the table renders deterministically.
  await page.goto(`${base}?priority=high`);
  await expect(page.getByTestId("cases-table")).toBeVisible();
  return base;
}

test.describe("Verify — team features", () => {
  test("cases list exposes CSV export and the bulk toolbar", async ({ page }) => {
    await gotoAcmeCases(page);

    // Export link is present and points at the export route with the filter.
    const exportLink = page.getByTestId("export-cases-csv");
    await expect(exportLink).toBeVisible();
    await expect(exportLink).toHaveAttribute("href", /\/cases\/export\?.*priority=high/);

    // Selecting all reveals the bulk toolbar with a live count and controls.
    await page.getByTestId("bulk-select-all").check();
    await expect(page.getByTestId("bulk-toolbar")).toBeVisible();
    await expect(page.getByTestId("bulk-count")).toContainText("selected");
    await expect(page.getByTestId("bulk-delete")).toBeVisible();
    // The toolbar offers the metadata selects (Priority/Status/Automation…).
    await expect(page.locator('[data-testid="bulk-toolbar"] select')).not.toHaveCount(0);
  });

  test("saving the current filter creates a reusable chip", async ({ page }) => {
    const base = await gotoAcmeCases(page);
    const name = `Highs ${Date.now().toString().slice(-6)}`;

    await page.getByTestId("saved-filter-open").click();
    await page.getByTestId("saved-filter-name").fill(name);
    await page.getByTestId("saved-filter-save").click();

    // The new chip shows up in the saved bar and links back to the same filter.
    const chip = page.getByTestId("saved-filter-chip").filter({ hasText: name });
    await expect(chip).toBeVisible();
    await expect(chip.getByRole("link", { name })).toHaveAttribute("href", /priority=high/);

    // Clicking it reloads the filtered view.
    await chip.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${base}\\?.*priority=high`));
    await expect(page.getByTestId("cases-table")).toBeVisible();
  });

  test("a case exposes its version history", async ({ page }) => {
    await gotoAcmeCases(page);
    // Open the first case in the filtered list.
    await page.getByTestId("case-row").first().getByRole("link").first().click();
    await expect(page.getByTestId("case-history-link")).toBeVisible();
    await page.getByTestId("case-history-link").click();

    await expect(page).toHaveURL(/\/cases\/[\w-]+\/history$/);
    await expect(page.getByRole("heading", { name: /Edit history/ })).toBeVisible();
    await expect(page.getByTestId("version-entry").first()).toBeVisible();
  });
});
