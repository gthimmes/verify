import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * E2E for folder management (rename / add subfolder / archive) in the cases
 * sidebar.  Each run creates a uniquely-named root folder so the test is
 * non-destructive to the shared seed, and archives it at the end so it does
 * not accumulate in the default tree view.
 */

async function gotoAcmeCases(page: Page) {
  await page.goto("/?list=1");
  await page.locator('[data-project-key="ACM"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases/);
}

// The per-folder "⋯" menu lives in the same row div as the folder link.
function folderRow(page: Page, name: string): Locator {
  return page
    .getByTestId("folder-link")
    .filter({ hasText: name })
    .locator("xpath=ancestor::div[1]");
}

test("create, rename, add subfolder, and archive a folder", async ({ page }) => {
  await gotoAcmeCases(page);

  const suffix = Date.now().toString().slice(-6);
  const name = `Zone ${suffix}`;
  const renamed = `Region ${suffix}`;
  const child = `Sub ${suffix}`;

  // Create a new root folder.
  await page.getByTestId("new-folder-open").click();
  await page.getByTestId("new-folder-input").fill(name);
  await page.getByTestId("new-folder-save").click();
  await expect(page.getByTestId("folder-link").filter({ hasText: name })).toBeVisible();

  // Rename it.
  await folderRow(page, name).getByTestId("folder-menu").click();
  await page.getByTestId("folder-rename").click();
  const input = page.getByTestId("folder-rename-input");
  await input.fill(renamed);
  await page.getByTestId("folder-rename-save").click();
  await expect(page.getByTestId("folder-link").filter({ hasText: renamed })).toBeVisible();
  await expect(page.getByTestId("folder-link").filter({ hasText: name })).toHaveCount(0);

  // Add a subfolder, then expand and confirm it appears.
  await folderRow(page, renamed).getByTestId("folder-menu").click();
  await page.getByTestId("folder-add-sub").click();
  await page.getByTestId("folder-subname-input").fill(child);
  await page.getByTestId("folder-subname-save").click();
  await expect(page.getByTestId("folder-link").filter({ hasText: child })).toBeVisible();

  // Archive the parent: it (and its child) leave the default tree.
  await folderRow(page, renamed).getByTestId("folder-menu").click();
  await page.getByTestId("folder-archive").click();
  await expect(page.getByTestId("folder-link").filter({ hasText: renamed })).toHaveCount(0);

  // The "Show archived" toggle brings it back, badged.
  await page.getByTestId("show-archived-toggle").click();
  const archivedRow = folderRow(page, renamed);
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow.getByText("archived")).toBeVisible();
});
