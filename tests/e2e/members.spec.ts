import { test, expect } from "@playwright/test";

/**
 * E2E for project members & roles management.  Runs in additive mode (auth not
 * enforced), where the demo admin can manage any project.  Adds a member by
 * email, changes their role, then removes them (cleanup).
 */

const API = "http://localhost:4000/api/v1";

test("add, re-role, and remove a project member", async ({ page, request }) => {
  const projects = await (await request.get(`${API}/projects`)).json();
  const acm = projects.find((p: { key: string }) => p.key === "ACM");
  test.skip(!acm, "ACM seed project missing");

  const email = `teammate-${Date.now()}@example.com`;

  await page.goto(`/projects/${acm.id}/settings`);
  await expect(page.getByTestId("add-member-form")).toBeVisible();

  // Add as editor.
  await page.getByTestId("member-email").fill(email);
  await page.getByTestId("member-role").selectOption("editor");
  await page.getByTestId("member-add").click();

  const row = page.getByTestId("member-row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("member-role-select")).toHaveValue("editor");

  // Re-role to viewer.
  await row.getByTestId("member-role-select").selectOption("viewer");
  await expect(row.getByTestId("member-role-select")).toHaveValue("viewer");

  // Remove (cleanup).
  await row.getByTestId("member-remove").click();
  await expect(
    page.getByTestId("member-row").filter({ hasText: email }),
  ).toHaveCount(0);
});
