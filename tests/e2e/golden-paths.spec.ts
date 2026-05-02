import { test, expect } from "@playwright/test";

test.describe("Verify — golden paths", () => {
  test("home page lists seeded projects", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    const cards = page.getByTestId("project-card");
    await expect(cards).not.toHaveCount(0);
    await expect(page.locator('[data-project-key="ACM"]')).toBeVisible();
  });

  test("create a new project, area, and feature", async ({ page }) => {
    const stamp = Date.now();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const newProjectButton = page.getByTestId("new-project-button").first();
    await expect(newProjectButton).toBeVisible();
    // Wait for the React handler to be attached. If we click before hydration,
    // React 19 with Turbopack dev mode silently drops the event.
    await page.waitForFunction(() => {
      const btn = document.querySelector(
        '[data-testid="new-project-button"]',
      ) as HTMLButtonElement | null;
      if (!btn) return false;
      // React attaches a fiber to the DOM node — its existence is a good hydration signal.
      const key = Object.keys(btn).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"),
      );
      return Boolean(key);
    });
    await newProjectButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByTestId("project-name-input").fill(`Smoke Project ${stamp}`);
    await dialog.getByTestId("project-key-input").fill("SMK");
    await dialog.getByTestId("project-submit").click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
    await expect(page.getByText("Smoke Project " + stamp).first()).toBeVisible();

    // create an area
    await page.getByTestId("new-area-button").first().click();
    const areaDialog = page.getByRole("dialog");
    await expect(areaDialog).toBeVisible();
    await areaDialog.getByTestId("area-name-input").fill("Checkout");
    await areaDialog.getByTestId("area-submit").click();
    await expect(page.getByText("Checkout").first()).toBeVisible();

    // create a feature
    await page.getByTestId("new-feature-button").first().click();
    const featureDialog = page.getByRole("dialog");
    await expect(featureDialog).toBeVisible();
    await featureDialog.getByTestId("feature-name-input").fill("Cart");
    await featureDialog.getByTestId("feature-submit").click();
    await expect(page.getByText("Cart").first()).toBeVisible();
  });

  test("authoring a test case persists steps and parameters", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-project-key="ACM"]').first().click();
    await expect(page.getByRole("heading", { name: /Acme Storefront/ })).toBeVisible();
    await page.getByTestId("new-case-cta").click();

    await page.getByTestId("case-title").fill("Pay invoice via Apple Pay");
    await page
      .getByTestId("case-feature")
      .selectOption({ label: "Payments › One-time payment" });
    await page
      .getByTestId("case-description")
      .fill("Apple Pay should charge and confirm.");
    await page.getByTestId("case-tags").fill("smoke, P0");

    // first step is already there; fill it
    await page
      .getByTestId("step-action-0")
      .fill("Open invoice and click Pay with Apple Pay");
    await page
      .getByTestId("step-expected-0")
      .fill("Apple Pay sheet appears");
    await page.getByTestId("add-step").click();
    await page.getByTestId("step-action-1").fill("Authorize the charge");
    await page.getByTestId("step-expected-1").fill("Receipt is rendered");

    // add a parameter and a row
    await page.getByTestId("add-param").click();
    await page.getByTestId("add-row").click();

    await page.getByTestId("case-automation-status").selectOption("not_automated");

    await page.getByTestId("case-submit").click();
    await expect(page).toHaveURL(/\/cases\/[\w-]+$/);
    await expect(page.getByRole("heading", { name: /Pay invoice via Apple Pay/ })).toBeVisible();
    await expect(page.getByText("Open invoice and click Pay with Apple Pay")).toBeVisible();
  });

  test("execute a pass and a fail in the in-progress run", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("heading", { name: "Active runs" })).toBeVisible();
    // click the in-progress AIW run
    await page.getByRole("link", { name: /May 1 nightly smoke/ }).click();
    await expect(page.getByRole("heading", { name: /Execute: May 1 nightly smoke/ })).not.toBeVisible();
    await page.getByTestId("execute-cta").click();
    await expect(page.getByRole("heading", { name: /Execute: May 1 nightly smoke/ })).toBeVisible();
    // first execution row — record a pass
    const firstRow = page.getByTestId("execution-row").first();
    await firstRow.getByTestId("result-pass").click();
    // second row — record a fail
    const rows = await page.getByTestId("execution-row").all();
    if (rows.length >= 2) {
      await rows[1].getByTestId("result-fail").click();
    }
  });

  test("reports page surfaces automation candidates", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-project-key="ACM"]').first().click();
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(
      page.getByRole("heading", { name: /Automation candidates/ }),
    ).toBeVisible();
    await expect(page.getByTestId("candidates-table")).toBeVisible();
  });

  test("global search finds a case by ID", async ({ page }) => {
    await page.goto("/search?q=ACM-PAY-0001");
    const results = page.getByTestId("search-result");
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText("ACM-PAY-0001");
  });
});
