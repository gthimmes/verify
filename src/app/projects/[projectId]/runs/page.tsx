import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });
  if (!project) return notFound();

  const runs = await prisma.testRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { executions: true } },
    },
  });

  // pull aggregate counts per run
  const stats = await Promise.all(
    runs.map(async (r) => {
      const grouped = await prisma.testExecution.groupBy({
        by: ["result"],
        where: { runId: r.id },
        _count: { _all: true },
      });
      const counts: Record<string, number> = {
        pass: 0,
        fail: 0,
        blocked: 0,
        skipped: 0,
        not_run: 0,
      };
      grouped.forEach((g) => (counts[g.result] = g._count._all));
      return { id: r.id, counts };
    }),
  );
  const statsById = Object.fromEntries(stats.map((s) => [s.id, s.counts]));

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
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
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                  Environment
                </th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                  Status
                </th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                  Progress
                </th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                  Pass rate
                </th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const c = statsById[r.id] ?? {};
                const total = r._count.executions || 1;
                const pass = c.pass ?? 0;
                const fail = c.fail ?? 0;
                const blocked = c.blocked ?? 0;
                const skipped = c.skipped ?? 0;
                const done = pass + fail + blocked + skipped;
                const passRate =
                  pass + fail === 0
                    ? "—"
                    : `${Math.round((pass / (pass + fail)) * 100)}%`;
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
                        <div className="font-mono text-[11px] text-(--muted)">
                          {r.build}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--muted)">
                      {r.environment ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={runStatusTone(r.status)}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 w-[200px]">
                      <ProgressBar
                        pass={pass}
                        fail={fail}
                        blocked={blocked}
                        skipped={skipped}
                        total={total}
                      />
                      <div className="mt-0.5 text-[11px] text-(--muted)">
                        {done} / {r._count.executions} executions
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{passRate}</td>
                    <td className="px-3 py-2 text-xs text-(--muted)">
                      {formatDate(r.createdAt)}
                    </td>
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
  const passW = (pass / total) * 100;
  const failW = (fail / total) * 100;
  const blockedW = (blocked / total) * 100;
  const skippedW = (skipped / total) * 100;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="bg-(--success)" style={{ width: `${passW}%` }} />
      <div className="bg-(--danger)" style={{ width: `${failW}%` }} />
      <div className="bg-(--warn)" style={{ width: `${blockedW}%` }} />
      <div className="bg-slate-300" style={{ width: `${skippedW}%` }} />
    </div>
  );
}
