import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Cross-process contract test.  Hits the Go API directly from Playwright and
 * asserts every field the UI relies on is present.  If a field disappears,
 * the UI will break — this test fails first.
 */

const API = process.env.VERIFY_API_URL ?? "http://localhost:4000";

async function get<T>(req: APIRequestContext, path: string): Promise<T> {
  const res = await req.get(`${API}${path}`);
  expect(res.ok(), `${path} failed: ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

test.describe("API contract — fields the UI consumes", () => {
  test("ProjectSummary shape", async ({ request }) => {
    const projects = await get<unknown[]>(request, "/api/v1/projects");
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects as Record<string, unknown>[]) {
      for (const field of [
        "id",
        "key",
        "name",
        "status",
        "ownerId",
        "ownerName",
        "createdAt",
        "updatedAt",
        "testCaseCount",
        "folderCount",
        "runCount",
        "activeRunCount",
        "automatedCount",
      ]) {
        expect(p, `${field} on project ${p.key as string}`).toHaveProperty(field);
      }
    }
  });

  test("TestCaseLite list shape", async ({ request }) => {
    const projects = await get<{ id: string }[]>(request, "/api/v1/projects");
    const cases = await get<unknown[]>(
      request,
      `/api/v1/projects/${projects[0].id}/cases`,
    );
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases as Record<string, unknown>[]) {
      for (const field of [
        "id",
        "projectId",
        "projectKey",
        "publicId",
        "title",
        "type",
        "priority",
        "automationStatus",
        "tags",
        "folderName",
        "folderPath",
        "dataRowCount",
      ]) {
        expect(c, `${field} on case ${c.publicId as string}`).toHaveProperty(field);
      }
    }
  });

  test("Run + Execution shape", async ({ request }) => {
    const runs = await get<{ id: string; counts: Record<string, number> }[]>(
      request,
      "/api/v1/runs?active=1",
    );
    if (runs.length === 0) test.skip(true, "no active runs");
    const r = runs[0];
    for (const field of ["total", "pass", "fail", "blocked", "skipped", "notRun"]) {
      expect(r.counts, `counts.${field}`).toHaveProperty(field);
    }
    const execs = await get<unknown[]>(request, `/api/v1/runs/${r.id}/executions`);
    expect(execs.length).toBeGreaterThan(0);
    for (const e of execs as Record<string, unknown>[]) {
      for (const field of [
        "id",
        "runId",
        "snapshotCaseId",
        "result",
        "snapshotCase",
        "attempts",
      ]) {
        expect(e).toHaveProperty(field);
      }
      const snap = e.snapshotCase as Record<string, unknown>;
      for (const field of ["publicId", "title", "type", "priority", "steps"]) {
        expect(snap, `snapshotCase.${field}`).toHaveProperty(field);
      }
    }
  });

  test("Report shape", async ({ request }) => {
    const projects = await get<{ id: string }[]>(request, "/api/v1/projects");
    const report = await get<Record<string, unknown>>(
      request,
      `/api/v1/projects/${projects[0].id}/report`,
    );
    for (const field of [
      "totalCases",
      "automationPct",
      "folderCoverage",
      "candidates",
      "topFailing",
      "staleAutomation",
      "staleManual",
    ]) {
      expect(report).toHaveProperty(field);
    }
  });
});
