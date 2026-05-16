import { test, expect } from "@playwright/test";

/**
 * Folder tree sidebar — keyboard-light interactions.
 *
 * This spec uses whichever project is present in the database that has
 * folders.  We pick the first non-archived project from the API.  That
 * way the spec works against the Acme demo seed, an imported Testiny
 * project, or any other project a developer happens to have loaded.
 *
 * If no project has folders, the spec skips.
 */

type Project = { id: string; key: string; testCaseCount: number };
type FolderNode = { name: string; caseCount: number; children: FolderNode[] };

const API_URL = process.env.VERIFY_API_URL ?? "http://localhost:4000";

async function pickProjectWithFolders(): Promise<
  { project: Project; topNodes: FolderNode[] } | null
> {
  const projects = (await (
    await fetch(`${API_URL}/api/v1/projects`)
  ).json()) as Project[];
  for (const p of projects.filter((p) => p.testCaseCount > 0)) {
    const tree = (await (
      await fetch(`${API_URL}/api/v1/projects/${p.id}/folders`)
    ).json()) as FolderNode[];
    if (tree.length > 0) return { project: p, topNodes: tree };
  }
  return null;
}

test.describe("Folder tree sidebar", () => {
  test("renders All-test-cases row with project total", async ({ page }) => {
    const picked = await pickProjectWithFolders();
    test.skip(!picked, "no project with folders loaded");
    await page.goto(`/projects/${picked!.project.id}/cases`);
    const allRow = page.getByTestId("folder-all");
    await expect(allRow).toBeVisible();
    await expect(allRow).toContainText("All test cases");
  });

  test("shows top-level folders from the API", async ({ page }) => {
    const picked = await pickProjectWithFolders();
    test.skip(!picked, "no project with folders loaded");
    await page.goto(`/projects/${picked!.project.id}/cases`);
    for (const top of picked!.topNodes.slice(0, 3)) {
      await expect(
        page.locator(`[data-folder-name="${top.name}"]`).first(),
      ).toBeVisible();
    }
  });

  test("clicking a folder filters the case list", async ({ page }) => {
    const picked = await pickProjectWithFolders();
    test.skip(!picked, "no project with folders loaded");
    const top = picked!.topNodes.find((n) => n.caseCount > 0);
    test.skip(!top, "no folder has cases");
    await page.goto(`/projects/${picked!.project.id}/cases`);
    await page.locator(`[data-folder-name="${top!.name}"]`).first().click();
    await expect(page).toHaveURL(/folder=/);
    await expect(page.getByTestId("case-row").first()).toBeVisible();
  });

  test("expanding a parent reveals its children", async ({ page }) => {
    const picked = await pickProjectWithFolders();
    test.skip(!picked, "no project with folders loaded");
    const parent = picked!.topNodes.find((n) => n.children.length > 0);
    test.skip(!parent, "no parent folder has children");
    await page.goto(`/projects/${picked!.project.id}/cases`);
    const child = parent!.children[0];
    // The default expand state is "top level open" so the child should be
    // visible immediately.  Then we collapse + re-expand to test the toggle.
    await expect(
      page.locator(`[data-folder-name="${child.name}"]`).first(),
    ).toBeVisible();
    const parentRow = page
      .locator(`[data-folder-name="${parent!.name}"]`)
      .first()
      .locator("xpath=ancestor::div[1]");
    const chevron = parentRow.getByTestId("folder-chevron");
    await chevron.click(); // collapse
    await chevron.click(); // re-expand
    await expect(
      page.locator(`[data-folder-name="${child.name}"]`).first(),
    ).toBeVisible();
  });
});
