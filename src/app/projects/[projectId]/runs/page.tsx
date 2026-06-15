import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge, runStatusTone } from "@/components/ui/Badge";
import { SavedFiltersBar } from "@/components/testcases/SavedFiltersBar";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string };

export default async function RunsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<SP>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const statusFilter = sp.status && sp.status !== "all" ? sp.status : undefined;
  const queryFilter = sp.q && sp.q.trim() !== "" ? sp.q.trim() : undefined;
  const hasFilter = Boolean(statusFilter || queryFilter);

  let project, runs, savedFilters;
  try {
    [project, runs, savedFilters] = await Promise.all([
      api.getProject(projectId),
      api.listRuns(projectId, { status: statusFilter, q: queryFilter }),
      api.listSavedFilters(projectId, "runs").catch(() => []),
    ]);
  } catch {
    return notFound();
  }

  // currentQuery mirrors the searchParams so a saved filter reloads the exact
  // same view. Only set keys are included.
  const currentQuery: Record<string, string> = {};
  if (queryFilter) currentQuery.q = queryFilter;
  if (statusFilter) currentQuery.status = statusFilter;

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Runs" },
        ]}
        title="Test runs"
        description="Each run is a frozen snapshot of selected cases plus their executions."
        actions={
          <Link href={`/projects/${projectId}/runs/new`}>
            <Button data-testid="new-run-cta">+ New run</Button>
          </Link>
        }
      />

      <Card>
        <form
          method="get"
          className="grid grid-cols-2 gap-3 border-b border-(--border) p-4 lg:grid-cols-6"
        >
          <Input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by name, build, milestone, env…"
            className="lg:col-span-3"
            data-testid="runs-search"
          />
          <Select name="status" defaultValue={sp.status ?? "all"} data-testid="runs-status-filter">
            <option value="all">Any status</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
            <option value="aborted">Aborted</option>
          </Select>
          <div className="flex items-center gap-2 lg:col-span-2">
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
            <Link
              href={`/projects/${projectId}/runs`}
              className="text-xs text-(--muted) hover:text-(--accent)"
            >
              Reset
            </Link>
          </div>
        </form>

        <SavedFiltersBar
          projectId={projectId}
          filters={savedFilters}
          currentQuery={currentQuery}
          canSave={hasFilter}
          scope="runs"
        />

        {runs.length === 0 ? (
          <EmptyState
            title={hasFilter ? "No runs match these filters" : "No runs yet"}
            description={
              hasFilter
                ? "Try adjusting or resetting the filters above."
                : "Create a run to start executing your manual test cases."
            }
            action={
              hasFilter ? (
                <Link href={`/projects/${projectId}/runs`}>
                  <Button variant="outline">Reset filters</Button>
                </Link>
              ) : (
                <Link href={`/projects/${projectId}/runs/new`}>
                  <Button>+ New run</Button>
                </Link>
              )
            }
          />
        ) : (
          <table className="min-w-full text-sm" data-testid="runs-table">
            <thead className="border-b border-(--border) bg-(--bg) text-left">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Run</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Environment</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Status</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Progress</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Pass rate</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const total = r.counts.total || 1;
                const done = r.counts.pass + r.counts.fail + r.counts.blocked + r.counts.skipped;
                const passRate =
                  r.counts.pass + r.counts.fail === 0
                    ? "—"
                    : `${Math.round((r.counts.pass / (r.counts.pass + r.counts.fail)) * 100)}%`;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-(--border) hover:bg-(--accent-soft)"
                    data-testid="run-row"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/projects/${projectId}/runs/${r.id}`}
                        className="font-medium text-(--fg) hover:text-(--accent)"
                      >
                        {r.name}
                      </Link>
                      {r.build ? (
                        <div className="font-mono text-[11px] text-(--muted)">{r.build}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--muted)">{r.environment ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={runStatusTone(r.status)}>{r.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-2 w-[200px]">
                      <ProgressBar
                        pass={r.counts.pass}
                        fail={r.counts.fail}
                        blocked={r.counts.blocked}
                        skipped={r.counts.skipped}
                        total={total}
                      />
                      <div className="mt-0.5 text-[11px] text-(--muted)">
                        {done} / {r.counts.total} executions
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{passRate}</td>
                    <td className="px-3 py-2 text-xs text-(--muted)">{formatDate(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}

function ProgressBar({
  pass,
  fail,
  blocked,
  skipped,
  total,
}: {
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  total: number;
}) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="bg-(--success)" style={{ width: `${(pass / total) * 100}%` }} />
      <div className="bg-(--danger)" style={{ width: `${(fail / total) * 100}%` }} />
      <div className="bg-(--warn)" style={{ width: `${(blocked / total) * 100}%` }} />
      <div className="bg-slate-300" style={{ width: `${(skipped / total) * 100}%` }} />
    </div>
  );
}
