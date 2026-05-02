import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, automationTone, priorityTone, resultTone } from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatDateTime } from "@/lib/utils";
import { duplicateTestCase, softDeleteTestCase } from "@/app/actions/testCases";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  const tc = await prisma.testCase.findFirst({
    where: { id: caseId, projectId },
    include: {
      project: true,
      feature: { include: { area: true } },
      steps: { orderBy: { order: "asc" } },
      parameters: { orderBy: { order: "asc" } },
      dataRows: { orderBy: { order: "asc" } },
      tags: { include: { tag: true } },
      createdBy: true,
      updatedBy: true,
      automationOwner: true,
      versions: {
        orderBy: { version: "desc" },
        take: 5,
      },
    },
  });
  if (!tc) return notFound();

  // recent executions across runs
  const recentExecutions = await prisma.testExecution.findMany({
    where: { snapshotCase: { testCaseId: caseId } },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      run: { select: { id: true, name: true, environment: true, build: true } },
      executedBy: true,
    },
  });

  const jiraKeys = (tc.jiraKeys ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: tc.project.name, href: `/projects/${projectId}` },
          { label: "Cases", href: `/projects/${projectId}/cases` },
          { label: tc.publicId },
        ]}
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono text-sm text-(--muted)">
              {tc.publicId}
            </span>
            <span>{tc.title}</span>
          </span>
        }
        description={
          <span className="text-xs text-(--muted)">
            {tc.feature.area.name} › {tc.feature.name}
          </span>
        }
        actions={
          <>
            <form action={duplicateTestCase}>
              <input type="hidden" name="id" value={tc.id} />
              <Button variant="outline" type="submit">
                Duplicate
              </Button>
            </form>
            <form action={softDeleteTestCase}>
              <input type="hidden" name="id" value={tc.id} />
              <input type="hidden" name="projectId" value={projectId} />
              <Button variant="outline" type="submit">
                Delete
              </Button>
            </form>
            <Link
              href={`/projects/${projectId}/cases/${tc.id}/edit`}
              data-testid="edit-case-link"
            >
              <Button>Edit</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Definition" />
            <CardBody className="flex flex-col gap-5">
              {tc.description ? (
                <Section title="Description">
                  <Prose>{tc.description}</Prose>
                </Section>
              ) : null}
              {tc.preconditions ? (
                <Section title="Preconditions">
                  <Prose>{tc.preconditions}</Prose>
                </Section>
              ) : null}
              <Section title={`Steps (${tc.steps.length})`}>
                {tc.steps.length === 0 ? (
                  <p className="text-xs text-(--muted)">No steps defined.</p>
                ) : (
                  <ol className="flex flex-col gap-2 text-sm">
                    {tc.steps.map((s, i) => (
                      <li
                        key={s.id}
                        className="grid grid-cols-[28px_1fr_1fr] gap-3 rounded-md border border-(--border) bg-white p-3"
                      >
                        <div className="text-center font-semibold text-(--muted)">
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-(--muted)">
                            Action
                          </div>
                          <Prose>{s.action}</Prose>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-(--muted)">
                            Expected
                          </div>
                          <Prose>{s.expected}</Prose>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
              {tc.finalExpected ? (
                <Section title="Final expected result">
                  <Prose>{tc.finalExpected}</Prose>
                </Section>
              ) : null}
              {tc.testDataNotes ? (
                <Section title="Test data notes">
                  <Prose>{tc.testDataNotes}</Prose>
                </Section>
              ) : null}
            </CardBody>
          </Card>

          {tc.parameters.length > 0 ? (
            <Card>
              <CardHeader
                title={`Data set (${tc.dataRows.length} rows × ${tc.parameters.length} columns)`}
                description="Each row generates its own execution per run."
              />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-(--border) bg-(--bg)">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-(--muted)">
                          Label
                        </th>
                        {tc.parameters.map((p) => (
                          <th
                            key={p.id}
                            className="px-3 py-2 text-left text-xs font-medium text-(--muted)"
                          >
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tc.dataRows.map((row) => {
                        const values = JSON.parse(row.valuesJson) as Record<
                          string,
                          string
                        >;
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-(--border)"
                          >
                            <td className="px-3 py-2 font-medium">
                              {row.label ?? `Row ${row.order + 1}`}
                            </td>
                            {tc.parameters.map((p) => (
                              <td
                                key={p.id}
                                className="px-3 py-2 font-mono text-xs"
                              >
                                {values[p.name] ?? ""}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Recent executions"
              description="Across all runs."
            />
            <CardBody>
              {recentExecutions.length === 0 ? (
                <p className="text-xs text-(--muted)">
                  No executions yet. Add this case to a run.
                </p>
              ) : (
                <ul className="divide-y divide-(--border)">
                  {recentExecutions.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <Badge tone={resultTone(e.result)}>{e.result}</Badge>
                        <Link
                          href={`/projects/${projectId}/runs/${e.runId}`}
                          className="hover:text-(--accent)"
                        >
                          {e.run.name}
                        </Link>
                        {e.dataRowLabel ? (
                          <span className="text-xs text-(--muted)">
                            [{e.dataRowLabel}]
                          </span>
                        ) : null}
                        {e.run.environment ? (
                          <span className="text-xs text-(--muted)">
                            {e.run.environment}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-(--muted)">
                        {formatDateTime(e.executedAt ?? e.updatedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Classification" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <KV label="Status">
                <Badge tone={tc.status === "deprecated" ? "muted" : "default"}>
                  {tc.status}
                </Badge>
              </KV>
              <KV label="Type">
                <span>{tc.type}</span>
              </KV>
              <KV label="Priority">
                <Badge tone={priorityTone(tc.priority)}>{tc.priority}</Badge>
              </KV>
              <KV label="Tags">
                {tc.tags.length === 0 ? (
                  <span className="text-xs text-(--muted)">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {tc.tags.map((t) => (
                      <Badge key={t.tagId} tone="muted">
                        {t.tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </KV>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Automation" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <KV label="Status">
                <Badge tone={automationTone(tc.automationStatus)}>
                  {tc.automationStatus.replace("_", " ")}
                </Badge>
              </KV>
              <KV label="Framework">
                <span>{tc.automationFramework ?? "—"}</span>
              </KV>
              <KV label="Reference">
                <span className="break-all font-mono text-xs">
                  {tc.automationRef ?? "—"}
                </span>
              </KV>
              {tc.automationRepoUrl ? (
                <KV label="Repo">
                  <a
                    href={tc.automationRepoUrl}
                    className="break-all text-xs text-(--accent) hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tc.automationRepoUrl}
                  </a>
                </KV>
              ) : null}
              <KV label="Last reviewed">
                <span className="text-xs">
                  {formatDate(tc.automationLastReviewedAt)}
                </span>
              </KV>
            </CardBody>
          </Card>

          {jiraKeys.length > 0 ? (
            <Card>
              <CardHeader title="Linked Jira issues" />
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {jiraKeys.map((k) => (
                    <li key={k}>
                      <Badge tone="info">{k}</Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Audit" />
            <CardBody className="flex flex-col gap-2 text-xs text-(--muted)">
              <div>Version {tc.version}</div>
              <div>
                Created by {tc.createdBy.name} · {formatDate(tc.createdAt)}
              </div>
              <div>
                Updated by {tc.updatedBy.name} · {formatDate(tc.updatedAt)}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
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

function Prose({ children }: { children: React.ReactNode }) {
  // simple text rendering. preserve line breaks.
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
  );
}
