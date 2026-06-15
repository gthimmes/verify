import { test, expect, type Page } from "@playwright/test";

/**
 * E2E for saved filters on the /runs list.  Mirrors the /cases saved-filter
 * flow but exercises the runs scope: filter the runs list, save the view as a
 * uniquely-named chip, and confirm it reloads the same filtered URL.
 * Non-destructive: only adds a uniquely-named saved filter.
 */

async function gotoAcmeRuns(page: Page): Promise<string> {
  await page.goto("/?list=1");
  await page.locator('[data-project-key="ACM"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases/);
  const projectId = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/projects/${projectId}/runs`);
  await expect(page.getByTestId("runs-search")).toBeVisible();
  return projectId;
}

test("filter the runs list and save the view", async ({ page }) => {
  const projectId = await gotoAcmeRuns(page);
  const name = `In-progress ${Date.now().toString().slice(-6)}`;

  // Apply a status filter.
  await page.getByTestId("runs-status-filter").selectOption("in_progress");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\/runs\?.*status=in_progress/);

  // Save the current filtered view.
  await page.getByTestId("saved-filter-open").click();
  await page.getByTestId("saved-filter-name").fill(name);
  await page.getByTestId("saved-filter-save").click();

  // The chip appears and links back to the same filter.
  const chip = page.getByTestId("saved-filter-chip").filter({ hasText: name });
  await expect(chip).toBeVisible();
  await expect(chip.getByRole("link", { name })).toHaveAttribute(
    "href",
    /status=in_progress/,
  );

  // Reset, then reload via the chip.
  await page.goto(`/projects/${projectId}/runs`);
  await page.getByTestId("saved-filter-chip").filter({ hasText: name }).getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/runs\?.*status=in_progress/);
});
