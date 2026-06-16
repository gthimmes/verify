import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, runStatusTone } from "@/components/ui/Badge";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { ExecutionRow } from "@/components/runs/ExecutionRow";

export const dynamic = "force-dynamic";

type SP = {
  filter?: string;
  focus?: string;
};

export default async function ExecuteRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; runId: string }>;
  searchParams: Promise<SP>;
}) {
  const { projectId, runId } = await params;
  const sp = await searchParams;

  let run, executions;
  try {
    [run, executions] = await Promise.all([api.getRun(runId), api.listExecutions(runId)]);
  } catch {
    return notFound();
  }

  const filter = sp.filter ?? "all";
  const filtered = executions.filter((e) => {
    if (filter === "not_run") return e.result === "not_run";
    if (filter === "pass") return e.result === "pass";
    if (filter === "fail") return e.result === "fail";
    if (filter === "blocked") return e.result === "blocked";
    if (filter === "skipped") return e.result === "skipped";
    if (filter === "incomplete") return e.result === "not_run" || e.result === "blocked";
    return true;
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
          { label: run.projectName, href: `/projects/${projectId}` },
          { label: "Runs", href: `/projects/${projectId}/runs` },
          { label: run.name, href: `/projects/${projectId}/runs/${runId}` },
          { label: "Execute" },
        ]}
        title={
          <span className="flex items-center gap-2">
            <span>Execute: {run.name}</span>
            <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
          </span>
        }
        description={`${filtered.length} of ${executions.length} shown`}
        actions={
          <Link href={`/projects/${projectId}/runs/${runId}`}>
            <Button variant="outline">← Back to summary</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <FilterLink
          href={`/projects/${projectId}/runs/${runId}/execute`}
          active={filter === "all"}
          label={`All (${executions.length})`}
        />
        <FilterLink
          href={`/projects/${projectId}/runs/${runId}/execute?filter=incomplete`}
          active={filter === "incomplete"}
          label={`Incomplete (${executions.filter((e) => e.result === "not_run" || e.result === "blocked").length})`}
        />
        <FilterLink
          href={`/projects/${projectId}/runs/${runId}/execute?filter=pass`}
          active={filter === "pass"}
          label={`Pass (${executions.filter((e) => e.result === "pass").length})`}
        />
        <FilterLink
          href={`/projects/${projectId}/runs/${runId}/execute?filter=fail`}
          active={filter === "fail"}
          label={`Fail (${executions.filter((e) => e.result === "fail").length})`}
        />
        <FilterLink
          href={`/projects/${projectId}/runs/${runId}/execute?filter=blocked`}
          active={filter === "blocked"}
          label={`Blocked (${executions.filter((e) => e.result === "blocked").length})`}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-(--muted)">
            Nothing matches this filter. Try another.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((e) => {
            const dataRow =
              e.dataRowIndex !== null
                ? e.snapshotCase.dataRows.find((r) => r.order === e.dataRowIndex)
                : null;
            return (
              <ExecutionRow
                key={e.id}
                projectId={projectId}
                runId={runId}
                expand={sp.focus === e.id || executions.length <= 5}
                execution={{
                  id: e.id,
                  result: e.result,
                  comments: e.comments,
                  durationSeconds: e.durationSeconds,
                  jiraDefectKeys: e.jiraDefectKeys,
                  envOverride: e.envOverride,
                  buildOverride: e.buildOverride,
                  dataRowIndex: e.dataRowIndex,
                  dataRowLabel: e.dataRowLabel,
                  values: dataRow?.values,
                  stepResults: e.stepResults,
                  attempts: e.attempts.map((a) => ({
                    attemptNum: a.attemptNum,
                    result: a.result,
                    executedAt: new Date(a.executedAt),
                  })),
                  caseSnapshot: {
                    publicId: e.snapshotCase.publicId,
                    title: e.snapshotCase.title,
                    description: e.snapshotCase.description,
                    preconditions: e.snapshotCase.preconditions,
                    finalExpected: e.snapshotCase.finalExpected,
                    priority: e.snapshotCase.priority,
                    type: e.snapshotCase.type,
                    steps: e.snapshotCase.steps.map((s) => ({
                      order: s.order,
                      action: s.action,
                      expected: s.expected,
                    })),
                  },
                }}
              />
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

function FilterLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-(--accent) px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-md border border-(--border) bg-(--surface) px-3 py-1.5 text-xs text-(--muted) hover:border-(--accent) hover:text-(--accent)"
      }
    >
      {label}
    </Link>
  );
}
