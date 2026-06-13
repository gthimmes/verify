import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, resultTone, runStatusTone } from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime, formatDate } from "@/lib/utils";
import { RunStatusActions } from "@/components/runs/RunStatusActions";
import { reRunFailed, cloneRun } from "@/app/actions/testRuns";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string }>;
}) {
  const { projectId, runId } = await params;
  let run, executions;
  try {
    [run, executions] = await Promise.all([api.getRun(runId), api.listExecutions(runId)]);
  } catch {
    return notFound();
  }

  const counts = run.counts;
  const done = counts.pass + counts.fail + counts.blocked + counts.skipped;
  const completion = counts.total === 0 ? 0 : (done / counts.total) * 100;
  const passRate =
    counts.pass + counts.fail === 0
      ? null
      : Math.round((counts.pass / (counts.pass + counts.fail)) * 100);

  // breakdown by priority
  const byPriority = new Map<string, { total: number; pass: number; fail: number }>();
  executions.forEach((e) => {
    const k = e.snapshotCase.priority;
    const prev = byPriority.get(k) ?? { total: 0, pass: 0, fail: 0 };
    prev.total++;
    if (e.result === "pass") prev.pass++;
    if (e.result === "fail") prev.fail++;
    byPriority.set(k, prev);
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
          { label: run.projectName, href: `/projects/${projectId}` },
          { label: "Runs", href: `/projects/${projectId}/runs` },
          { label: run.name },
        ]}
        title={
          <span className="flex items-center gap-2">
            <span>{run.name}</span>
            <Badge tone={runStatusTone(run.status)}>{run.status.replace("_", " ")}</Badge>
          </span>
        }
        description={run.description ?? "Snapshot of a moment in time."}
        actions={
          <>
            <RunStatusActions runId={run.id} projectId={projectId} status={run.status} />
            <a href={`/projects/${projectId}/runs/${run.id}/export`} download>
              <Button variant="outline" data-testid="export-run-csv">
                Export CSV
              </Button>
            </a>
            <Link href={`/projects/${projectId}/runs/${run.id}/execute`}>
              <Button data-testid="execute-cta">Execute tests</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Progress" />
            <CardBody className="flex flex-col gap-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-(--success)" style={{ width: `${(counts.pass / Math.max(1, counts.total)) * 100}%` }} />
                <div className="bg-(--danger)" style={{ width: `${(counts.fail / Math.max(1, counts.total)) * 100}%` }} />
                <div className="bg-(--warn)" style={{ width: `${(counts.blocked / Math.max(1, counts.total)) * 100}%` }} />
                <div className="bg-slate-300" style={{ width: `${(counts.skipped / Math.max(1, counts.total)) * 100}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
                <Stat label="Total" value={counts.total} tone="muted" />
                <Stat label="Pass" value={counts.pass} tone="success" />
                <Stat label="Fail" value={counts.fail} tone="danger" />
                <Stat label="Blocked" value={counts.blocked} tone="warn" />
                <Stat label="Not run" value={counts.notRun} tone="muted" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-(--muted)">
                <div>Completion: {Math.round(completion)}%</div>
                <div>
                  Pass rate: {passRate === null ? "—" : `${passRate}%`}{" "}
                  <span className="text-(--muted-2)">(of pass+fail only)</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Executions"
              description={`${counts.total} executions across ${new Set(executions.map((e) => e.snapshotCaseId)).size} cases.`}
            />
            <CardBody className="-m-5 overflow-x-auto p-0">
              <table className="min-w-full text-sm" data-testid="run-executions-table">
                <thead className="border-b border-(--border) bg-(--bg) text-left">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Case</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Title</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Row</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Result</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-(--border) hover:bg-(--accent-soft)"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={`/projects/${projectId}/cases/${e.snapshotCase.testCaseId}`}
                          className="hover:text-(--accent)"
                        >
                          {e.snapshotCase.publicId}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/projects/${projectId}/runs/${run.id}/execute?focus=${e.id}`}
                          className="hover:text-(--accent)"
                        >
                          {e.snapshotCase.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-(--muted)">{e.dataRowLabel ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge tone={resultTone(e.result)}>{e.result.replace("_", " ")}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-(--muted)">
                        {e.executedAt ? `${e.executedByName ?? "?"} · ${formatDateTime(e.executedAt)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Run metadata" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <KV label="Owner">{run.ownerName}</KV>
              <KV label="Environment">{run.environment ?? "—"}</KV>
              <KV label="Build">
                <span className="font-mono text-xs">{run.build ?? "—"}</span>
              </KV>
              <KV label="Milestone">{run.milestone ?? "—"}</KV>
              <KV label="Planned">
                {formatDate(run.plannedStart)} → {formatDate(run.plannedEnd)}
              </KV>
              <KV label="Actual">
                {formatDate(run.actualStart)} → {formatDate(run.actualEnd)}
              </KV>
              <KV label="Created">{formatDate(run.createdAt)}</KV>
              {run.parentRunId ? (
                <KV label="Re-run of">
                  <Link
                    href={`/projects/${projectId}/runs/${run.parentRunId}`}
                    className="text-(--accent) hover:underline"
                  >
                    {run.parentRunName ?? "parent"}
                  </Link>
                </KV>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Breakdown by priority" />
            <CardBody>
              {byPriority.size === 0 ? (
                <p className="text-xs text-(--muted)">No data yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {[...byPriority.entries()].map(([prio, c]) => {
                    const rate =
                      c.pass + c.fail === 0
                        ? null
                        : Math.round((c.pass / (c.pass + c.fail)) * 100);
                    return (
                      <li key={prio} className="flex items-center justify-between">
                        <span>{prio}</span>
                        <span className="text-xs text-(--muted)">
                          {c.pass}/{c.total} pass · {rate ?? "—"}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardBody className="flex flex-col gap-2">
              <form action={cloneRun}>
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit" variant="outline" className="w-full">
                  Clone as new run
                </Button>
              </form>
              <form action={reRunFailed}>
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="projectId" value={projectId} />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={counts.fail === 0 && counts.blocked === 0}
                >
                  Re-run failed/blocked ({counts.fail + counts.blocked})
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "success" | "danger" | "warn";
}) {
  const colorClass =
    tone === "success"
      ? "text-(--success)"
      : tone === "danger"
        ? "text-(--danger)"
        : tone === "warn"
          ? "text-(--warn)"
          : "text-(--fg)";
  return (
    <div className="rounded-md border border-(--border) p-3 text-center">
      <div className={`text-2xl font-semibold ${colorClass}`}>{value}</div>
      <div className="text-xs text-(--muted)">{label}</div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-(--muted)">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
