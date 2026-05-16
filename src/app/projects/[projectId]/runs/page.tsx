import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, runStatusTone } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunsListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project, runs;
  try {
    [project, runs] = await Promise.all([api.getProject(projectId), api.listRuns(projectId)]);
  } catch {
    return notFound();
  }

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

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Create a run to start executing your manual test cases."
          action={
            <Link href={`/projects/${projectId}/runs/new`}>
              <Button>+ New run</Button>
            </Link>
          }
        />
      ) : (
        <Card>
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
        </Card>
      )}
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
