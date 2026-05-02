import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project, report;
  try {
    [project, report] = await Promise.all([
      api.getProject(projectId),
      api.projectReport(projectId),
    ]);
  } catch {
    return notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Reports" },
        ]}
        title="Reports"
        description="Coverage, automation candidates, and staleness — the strategic view."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Total cases" value={report.totalCases.toString()} />
        <KPICard
          label="Automation rate"
          value={`${report.automationPct}%`}
          subtitle={`${report.automatedCount} automated`}
        />
        <KPICard
          label="Areas covered"
          value={report.areaCoverage.length.toString()}
        />
        <KPICard
          label="Cases recently run"
          value={report.recentlyExecuted.toString()}
          subtitle="Across all runs"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Automation candidates"
            description="Manual cases ranked by execution frequency, failure rate, priority, and effort."
          />
          <CardBody className="-m-5 p-0">
            {report.candidates.length === 0 ? (
              <p className="p-6 text-sm text-(--muted)">
                No manual cases to recommend. Try seeding more data or running tests first.
              </p>
            ) : (
              <table className="min-w-full text-sm" data-testid="candidates-table">
                <thead className="border-b border-(--border) bg-(--bg) text-left">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">#</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Case</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Priority</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Runs</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Fail %</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {report.candidates.map((row, i) => (
                    <tr
                      key={row.case.id}
                      className="border-b border-(--border) hover:bg-(--accent-soft)"
                    >
                      <td className="px-3 py-2 text-xs text-(--muted)">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/projects/${projectId}/cases/${row.case.id}`}
                          className="hover:text-(--accent)"
                        >
                          <span className="font-mono text-xs text-(--muted)">
                            {row.case.publicId}
                          </span>{" "}
                          <span className="font-medium">{row.case.title}</span>
                        </Link>
                        <div className="text-[11px] text-(--muted)">
                          {row.case.areaName} › {row.case.featureName}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={priorityTone(row.case.priority)}>{row.case.priority}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.runs}</td>
                      <td className="px-3 py-2 text-xs">{row.failPct}%</td>
                      <td className="px-3 py-2 text-xs font-medium">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Coverage by area"
            description="Where is the test catalog thick or thin? How automated is each area?"
          />
          <CardBody className="-m-5 p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-(--border) bg-(--bg) text-left">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Area</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Cases</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Automation %</th>
                </tr>
              </thead>
              <tbody>
                {report.areaCoverage
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <tr key={a.areaId} className="border-b border-(--border)">
                      <td className="px-3 py-2">
                        <Badge tone="default">{a.key}</Badge>{" "}
                        <span className="ml-2">{a.name}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{a.total}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-2 bg-(--accent)"
                              style={{ width: `${a.automationPct}%` }}
                            />
                          </div>
                          <span className="text-xs">{a.automationPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top failing cases (last 90 days)"
            description="Cases worth investigating or improving."
          />
          <CardBody>
            {report.topFailing.length === 0 ? (
              <p className="text-sm text-(--muted)">No failures in the last 90 days.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {report.topFailing.map((row) => (
                  <li
                    key={row.case.id}
                    className="flex items-center justify-between gap-3 border-b border-(--border) pb-1.5 last:border-0"
                  >
                    <Link
                      href={`/projects/${projectId}/cases/${row.case.id}`}
                      className="flex flex-1 flex-wrap items-center gap-2 hover:text-(--accent)"
                    >
                      <span className="font-mono text-xs text-(--muted)">
                        {row.case.publicId}
                      </span>
                      <span>{row.case.title}</span>
                    </Link>
                    <Badge tone="danger">{row.count} fails</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Stale automation metadata"
            description="Marked automated but not reviewed in 90+ days. Verify before trusting."
          />
          <CardBody>
            {report.staleAutomation.length === 0 ? (
              <p className="text-sm text-(--muted)">Nothing is stale. Nice.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {report.staleAutomation.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 border-b border-(--border) pb-1.5 last:border-0"
                  >
                    <Link
                      href={`/projects/${projectId}/cases/${c.id}`}
                      className="flex flex-1 flex-wrap items-center gap-2 hover:text-(--accent)"
                    >
                      <span className="font-mono text-xs text-(--muted)">{c.publicId}</span>
                      <span>{c.title}</span>
                      <Badge tone={automationTone(c.automationStatus)}>
                        {c.automationStatus}
                      </Badge>
                    </Link>
                    <span className="text-xs text-(--muted)">
                      Reviewed: {formatDate(c.automationLastReviewedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Stale manual cases"
            description="Active manual cases not run in 60+ days — might be obsolete or under-tested."
          />
          <CardBody>
            {report.staleManual.length === 0 ? (
              <p className="text-sm text-(--muted)">Every manual case has been run recently.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                {report.staleManual.map((row) => (
                  <li
                    key={row.case.id}
                    className="rounded-md border border-(--border) p-2"
                  >
                    <Link
                      href={`/projects/${projectId}/cases/${row.case.id}`}
                      className="flex items-center gap-2 hover:text-(--accent)"
                    >
                      <span className="font-mono text-xs text-(--muted)">{row.case.publicId}</span>
                      <span className="flex-1 truncate">{row.case.title}</span>
                    </Link>
                    <div className="mt-0.5 text-xs text-(--muted)">
                      {row.case.areaName} › {row.case.featureName} · last run:{" "}
                      {formatDate(row.lastRunAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}

function KPICard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <div className="p-4">
        <div className="text-xs text-(--muted)">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-(--fg)">{value}</div>
        {subtitle ? (
          <div className="mt-0.5 text-xs text-(--muted)">{subtitle}</div>
        ) : null}
      </div>
    </Card>
  );
}
