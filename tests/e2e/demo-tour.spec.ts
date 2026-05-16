import { test, expect } from "@playwright/test";

/**
 * Demo tour — narrates the entire app in one sweep, with the video recorder
 * always on. Run it with:  npm run e2e:demo
 *
 * Hard-coded slowdowns let the recording read like a guided walkthrough.
 */

const SLOW = 800;
async function pause(page: import("@playwright/test").Page, ms = SLOW) {
  await page.waitForTimeout(ms);
}

test("demo tour", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/?list=1");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await pause(page, 1500);

  // overview cards
  await page.locator('[data-project-key="ACM"]').first().hover();
  await pause(page);

  await page.locator('[data-project-key="ACM"]').first().click();
  // Clicking a project card lands on the folder view (cases page) — the
  // project name + key badge is the page title here.
  await expect(page.getByRole("heading", { name: /Acme Storefront/ })).toBeVisible();
  await pause(page, 1500);

  // tour the folder tree + case list
  await page.mouse.wheel(0, 350);
  await pause(page);
  await page.mouse.wheel(0, 250);
  await pause(page);
  await page.mouse.wheel(0, -600);
  await pause(page);

  // open a test case
  await page.getByText("ACM-PAY-0001", { exact: false }).first().click();
  await expect(page.getByRole("heading", { name: /Pay an invoice with a credit card/ })).toBeVisible();
  await pause(page, 1500);
  await page.mouse.wheel(0, 400);
  await pause(page);
  await page.mouse.wheel(0, -400);
  await pause(page);

  // back to the project cases view via the breadcrumb
  await page.getByRole("link", { name: "Cases" }).first().click();
  await expect(page.getByTestId("cases-table")).toBeVisible();
  await pause(page, 1500);

  // filter critical priority
  await page.locator('select[name="priority"]').selectOption("critical");
  await page.getByRole("button", { name: "Apply" }).click();
  await pause(page, 1500);

  // open reports
  await page
    .getByRole("link", { name: /Acme Storefront/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Reports" }).first().click();
  await expect(
    page.getByRole("heading", { name: /Automation candidates/ }),
  ).toBeVisible();
  await pause(page, 1500);
  await page.mouse.wheel(0, 500);
  await pause(page);
  await page.mouse.wheel(0, 500);
  await pause(page);
  await page.mouse.wheel(0, -1000);

  // back to project, into runs (project link redirects to /cases)
  await page
    .getByRole("link", { name: /Acme Storefront/ })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[\w-]+\/cases$/);
  await pause(page, 600);
  await page.locator('a[href*="/projects/"][href$="/runs"]').first().click();
  await page.waitForURL(/\/projects\/[\w-]+\/runs$/);
  await expect(page.getByTestId("runs-table")).toBeVisible();
  await pause(page, 1500);

  // open the in-progress run
  await page.getByRole("link", { name: /May 1 nightly smoke/ }).click();
  await expect(page.getByRole("heading", { name: /May 1 nightly smoke/ })).toBeVisible();
  await pause(page, 1500);

  // jump into execution
  await page.getByTestId("execute-cta").click();
  await expect(page.locator("text=Execute:").first()).toBeVisible();
  await pause(page, 1500);

  // expand the first row, record a pass
  const firstRow = page.getByTestId("execution-row").first();
  await firstRow.scrollIntoViewIfNeeded();
  await pause(page);
  await firstRow.getByTestId("result-pass").click();
  await pause(page, 1200);

  // record a fail on a later row
  const rows = await page.getByTestId("execution-row").all();
  if (rows.length >= 3) {
    await rows[2].scrollIntoViewIfNeeded();
    await rows[2].getByTestId("result-fail").click();
    await pause(page, 1200);
  }

  // global search
  await page.goto("/search?q=refund");
  await pause(page, 1500);

  // admin
  await page.getByRole("link", { name: "Admin" }).first().click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await pause(page, 1500);

  // home one more time
  await page.getByRole("link", { name: "Verify" }).first().click();
  await pause(page, 1500);
});
