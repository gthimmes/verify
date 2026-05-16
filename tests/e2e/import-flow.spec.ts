import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * E2E for the Testiny xlsx importer.
 *
 * Runs the importer CLI against the synthetic fixture
 * (backend/internal/importer/testdata/fixture.xlsx), then checks the
 * Next.js UI renders the imported project, folders, and cases.
 *
 * The project key + name are unique per run so successive invocations
 * never collide and never accumulate duplicate cases.
 */

const STAMP = String(Date.now()).slice(-5);
const PROJECT_KEY = `IMP${STAMP}`;
const PROJECT_NAME = `Importer E2E ${STAMP}`;

test.beforeAll(async () => {
  const backend = join(process.cwd(), "backend");
  const fixture = join(
    backend,
    "internal",
    "importer",
    "testdata",
    "fixture.xlsx",
  );
  execFileSync(
    "go",
    [
      "run",
      "./cmd/import-testiny",
      "--xlsx",
      fixture,
      "--project-key",
      PROJECT_KEY,
      "--create-project",
      "--project-name",
      PROJECT_NAME,
      "--apply",
    ],
    { cwd: backend, stdio: "inherit" },
  );
});

test("imported project appears on home and shows the folder tree", async ({
  page,
}) => {
  await page.goto("/?list=1");
  const card = page.locator(`[data-project-key="${PROJECT_KEY}"]`);
  await expect(card).toBeVisible();
  // Clicking a card lands on the folder view directly (/projects/[id]
  // redirects to /cases), so no extra navigation is needed.
  await card.click();
  await expect(
    page.getByRole("heading", { name: new RegExp(PROJECT_NAME) }),
  ).toBeVisible();

  for (const name of ["Demo Project", "DEPRECATED", "CRITICAL CHANGES"]) {
    await expect(
      page.locator(`[data-folder-name="${name}"]`).first(),
    ).toBeVisible();
  }
});

test("imported test cases render with steps and metadata", async ({ page }) => {
  await page.goto("/?list=1");
  await page.locator(`[data-project-key="${PROJECT_KEY}"]`).first().click();

  // Folder filtering is non-recursive: the case lives directly in
  // "Demo Project > Module A", so we drill into Module A.
  await page.locator('[data-folder-name="Module A"]').first().click();

  const row = page.getByText("Open module landing page").first();
  await expect(row).toBeVisible();
  await row.click();

  await expect(
    page.getByRole("heading", { name: /Open module landing page/ }),
  ).toBeVisible();
  await expect(page.getByText("User is logged in")).toBeVisible();
  await expect(page.getByText("Navigate to /module-a")).toBeVisible();
  await expect(page.getByText("The module landing page renders")).toBeVisible();
});

test("multi-scenario case becomes one step per [N] block", async ({ page }) => {
  await page.goto(`/search?q=Draft%20creation%20across%20roles`);
  const result = page.getByTestId("search-result").first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(
    page.getByRole("heading", { name: /Draft creation across roles/ }),
  ).toBeVisible();
  await expect(page.getByText("Sign in as admin")).toBeVisible();
  await expect(page.getByText("Sign in as manager")).toBeVisible();
});

test("deprecated case lands under DEPRECATED folder", async ({ page }) => {
  await page.goto("/?list=1");
  await page.locator(`[data-project-key="${PROJECT_KEY}"]`).first().click();
  // The deprecated case lives at "DEPRECATED > Old Module" — non-recursive
  // filtering means we drill into the leaf, not the DEPRECATED root.
  await expect(
    page.locator('[data-folder-name="DEPRECATED"]').first(),
  ).toBeVisible();
  await page.locator('[data-folder-name="Old Module"]').first().click();
  await expect(page.getByText("[DEPRECATED] Old test").first()).toBeVisible();
});
