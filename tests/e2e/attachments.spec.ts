import { test, expect } from "@playwright/test";

/**
 * E2E for attachments on a test case: upload a file via the hidden input,
 * see it listed, then delete it (cleanup keeps the seed tidy).
 */

const API = "http://localhost:4000/api/v1";

test("upload and delete an attachment on a case", async ({ page, request }) => {
  const projects = await (await request.get(`${API}/projects`)).json();
  const acm = projects.find((p: { key: string }) => p.key === "ACM");
  test.skip(!acm, "ACM seed project missing");
  const cases = await (
    await request.get(`${API}/projects/${acm.id}/cases?limit=1`)
  ).json();
  test.skip(cases.length < 1, "need a case");
  const c = cases[0];
  const filename = `note-${Date.now()}.txt`;

  await page.goto(`/projects/${acm.id}/cases/${c.id}`);
  await expect(page.getByTestId("attachments")).toBeVisible();

  await page.getByTestId("attachment-input").setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("hello from playwright"),
  });

  const item = page.getByTestId("attachment-item").filter({ hasText: filename });
  await expect(item).toBeVisible();
  // The download link points at the same-origin proxy route.
  await expect(item.getByTestId("attachment-link")).toHaveAttribute(
    "href",
    /\/api\/attachments\/[\w-]+/,
  );

  // Delete (cleanup).
  await item.getByTestId("attachment-delete").click();
  await expect(
    page.getByTestId("attachment-item").filter({ hasText: filename }),
  ).toHaveCount(0);
});
