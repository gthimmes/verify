import { test, expect } from "@playwright/test";

/**
 * Default-view behaviour: the folder view of a project is the default landing
 * for both the home page and the project landing.
 *
 *   /                         → redirect to most-recently-updated active
 *                                project's /cases (folder view)
 *   /?list=1                  → render the project list (escape hatch used by
 *                                the header nav + breadcrumbs)
 *   /?archived=1              → render the archived project list
 *   /projects/[id]            → redirect to /projects/[id]/cases
 *   /projects/[id]/cases      → folder view, with Overview/Runs/Reports nav
 *   /projects/[id]/overview   → preserved dashboard (Areas/Features, KPIs)
 *
 * To keep the most-recently-updated assertion deterministic, each "redirect"
 * test patches a target project's name right before navigation so its
 * updated_at is the current `now()`. Tests run with workers=1 (see
 * playwright.config.ts) so nothing else mutates state between the patch and
 * the goto.
 */

const API = process.env.VERIFY_API_URL ?? "http://localhost:4000";

type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  status: string;
  updatedAt: string;
};

async function listActiveProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${API}/api/v1/projects`);
  if (!res.ok) throw new Error(`GET /projects failed: ${res.status}`);
  return (await res.json()) as ProjectSummary[];
}

async function bumpProject(id: string, name: string): Promise<void> {
  const res = await fetch(`${API}/api/v1/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`PATCH /projects/${id} failed: ${res.status}`);
  }
}

test.describe("Default view — folder view is the landing", () => {
  test("/ redirects to the most-recently-updated project's folder view", async ({
    page,
  }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects to land on");
    // Pick any project and bump its updated_at to "now" so we know it must
    // be the redirect target.
    const target = projects[0];
    await bumpProject(target.id, target.name);

    await page.goto("/");

    await expect(page).toHaveURL(
      new RegExp(`/projects/${target.id}/cases(?:\\?|$)`),
    );
    // The folder view's title contains the project name + key badge.
    await expect(
      page.getByRole("heading", { name: new RegExp(target.name) }),
    ).toBeVisible();
    // Sidebar "All test cases" row is the giveaway for the folder view.
    await expect(page.getByTestId("folder-all")).toBeVisible();
  });

  test("/?list=1 renders the project list (escape hatch)", async ({ page }) => {
    await page.goto("/?list=1");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByTestId("project-grid")).toBeVisible();
    await expect(page.getByTestId("project-card").first()).toBeVisible();
    // The "Show archived" toggle is the list-mode UI, not the folder view.
    await expect(page.getByRole("link", { name: "Show archived" })).toBeVisible();
  });

  test("/?archived=1 renders the project list without redirecting", async ({
    page,
  }) => {
    await page.goto("/?archived=1");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    // When in archived mode we expose the inverse toggle.
    await expect(page.getByRole("link", { name: "Hide archived" })).toBeVisible();
    // URL must not have redirected away from /?archived=1.
    await expect(page).toHaveURL(/\/\?archived=1$/);
  });

  test("/projects/[id] redirects to /projects/[id]/cases", async ({ page }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects");
    const id = projects[0].id;
    await page.goto(`/projects/${id}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${id}/cases$`));
    await expect(page.getByTestId("folder-all")).toBeVisible();
  });

  test("/cases header exposes Overview / Runs / Reports / + New test case", async ({
    page,
  }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects");
    const id = projects[0].id;
    await page.goto(`/projects/${id}/cases`);

    // Scope to <main> — the global header has an "Active runs" link that
    // would otherwise collide with the page's own "Runs" link.
    const main = page.getByRole("main");

    const overview = main.getByRole("link", { name: "Overview", exact: true });
    await expect(overview).toBeVisible();
    await expect(overview).toHaveAttribute(
      "href",
      `/projects/${id}/overview`,
    );

    const runs = main.getByRole("link", { name: "Runs", exact: true });
    await expect(runs).toBeVisible();
    await expect(runs).toHaveAttribute("href", `/projects/${id}/runs`);

    const reports = main.getByRole("link", { name: "Reports", exact: true });
    await expect(reports).toBeVisible();
    await expect(reports).toHaveAttribute("href", `/projects/${id}/reports`);

    await expect(page.getByTestId("new-case-cta")).toBeVisible();
  });

  test("Overview link from /cases lands on the preserved dashboard", async ({
    page,
  }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects");
    const id = projects[0].id;
    await page.goto(`/projects/${id}/cases`);
    await page.getByRole("link", { name: "Overview" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${id}/overview$`));
    // The overview keeps the "Hierarchy" heading and area-creation entry
    // point — area/feature management lives here, not on the cases page.
    await expect(
      page.getByRole("heading", { name: "Hierarchy" }),
    ).toBeVisible();
    await expect(page.getByTestId("new-area-button").first()).toBeVisible();
  });

  test("breadcrumb 'Projects' link goes to the list (does not loop)", async ({
    page,
  }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects");
    const id = projects[0].id;
    await page.goto(`/projects/${id}/cases`);

    // Crumb 'Projects' must point at the explicit list, otherwise clicking it
    // would just redirect us back to a project's /cases (loop).
    const crumb = page
      .locator('nav[aria-label="breadcrumb"]')
      .getByRole("link", { name: "Projects" });
    await expect(crumb).toBeVisible();
    await expect(crumb).toHaveAttribute("href", "/?list=1");

    await crumb.click();
    await expect(page).toHaveURL(/\/\?list=1$/);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });

  test("header 'Projects' nav goes to the list, not the redirect", async ({
    page,
  }) => {
    const projects = await listActiveProjects();
    test.skip(projects.length === 0, "no active projects");
    await page.goto(`/projects/${projects[0].id}/cases`);
    const headerLink = page
      .locator("header")
      .getByRole("link", { name: "Projects" });
    await expect(headerLink).toHaveAttribute("href", "/?list=1");
  });
});
