import { test, expect } from "@playwright/test";

/**
 * E2E for "see also" case relations: from a case detail page, search for
 * another case, link it, see it appear (and reflected via the API), then
 * unlink it.  Pre-cleans via the API so reruns start from a known state.
 */

const API = "http://localhost:4000/api/v1";

test("link and unlink a related case", async ({ page, request }) => {
  const projects = await (await request.get(`${API}/projects`)).json();
  const acm = projects.find((p: { key: string }) => p.key === "ACM");
  test.skip(!acm, "ACM seed project missing");
  const cases = await (
    await request.get(`${API}/projects/${acm.id}/cases?limit=5`)
  ).json();
  test.skip(cases.length < 2, "need at least two cases");
  const a = cases[0];
  const b = cases[1];

  // Known clean state regardless of prior runs.
  await request.delete(`${API}/cases/${a.id}/relations/${b.id}`).catch(() => {});

  await page.goto(`/projects/${acm.id}/cases/${a.id}`);
  await expect(page.getByTestId("related-cases")).toBeVisible();

  // Open the typeahead and search for case B by its public id.
  await page.getByTestId("related-add-open").click();
  await page.getByTestId("related-search").fill(b.publicId);
  const candidate = page
    .getByTestId("related-candidate")
    .filter({ hasText: b.publicId });
  await expect(candidate).toBeVisible();
  await candidate.click();

  // It shows up in the linked list…
  const linked = page.getByTestId("related-case").filter({ hasText: b.publicId });
  await expect(linked).toBeVisible();

  // …and the link is undirected per the API (visible from B too).
  await expect
    .poll(async () => {
      const rels = await (
        await request.get(`${API}/cases/${b.id}/relations`)
      ).json();
      return rels.some((r: { id: string }) => r.id === a.id);
    })
    .toBe(true);

  // Unlink (also cleans up).
  await linked.getByTestId("related-remove").click();
  await expect(
    page.getByTestId("related-case").filter({ hasText: b.publicId }),
  ).toHaveCount(0);
});
