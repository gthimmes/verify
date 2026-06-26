import { test, expect } from "@playwright/test";

/**
 * E2E for test-case templates: create one in the admin UI, confirm it lists,
 * then use it on the new-case form to prefill the title, and finally delete it
 * (cleanup keeps the catalog tidy).
 */

const API = "http://localhost:4000/api/v1";

test("create a template, use it on the new-case form, delete it", async ({ page, request }) => {
  const projects = await (await request.get(`${API}/projects`)).json();
  const acm = projects.find((p: { key: string }) => p.key === "ACM");
  test.skip(!acm, "ACM seed project missing");

  const name = `Smoke template ${Date.now()}`;
  const prefillTitle = "Verify the thing returns 200";

  // Create via the admin UI.
  await page.goto("/admin/templates");
  await page.getByTestId("new-template").click();
  await page.getByTestId("template-name").fill(name);
  await page.getByTestId("template-desc").fill("Standard happy-path smoke check");
  // Give the default case title a value so we can assert the prefill later.
  await page.getByLabel("Default case title").fill(prefillTitle);
  await page.getByTestId("tpl-add-step").click();
  await page.getByTestId("template-submit").click();

  const row = page.getByTestId("template-row").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Use it on the new-case form: selecting the template prefills the title.
  await page.goto(`/projects/${acm.id}/cases/new`);
  await expect(page.getByTestId("template-picker")).toBeVisible();
  await page
    .getByTestId("template-picker")
    .selectOption({ label: name });
  await expect(page.getByTestId("case-title")).toHaveValue(prefillTitle);

  // Cleanup: delete the template.
  await page.goto("/admin/templates");
  const row2 = page.getByTestId("template-row").filter({ hasText: name });
  await row2.getByTestId("template-delete").click();
  await expect(
    page.getByTestId("template-row").filter({ hasText: name }),
  ).toHaveCount(0);
});
