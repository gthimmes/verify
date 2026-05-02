import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, automationTone, priorityTone, resultTone } from "@/components/ui/Badge";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });
  if (!project) return notFound();

  const cases = await prisma.testCase.findMany({
    where: { projectId, deletedAt: null },
    include: {
      feature: { include: { area: true } },
      steps: true,
    },
  });

  const totalCases = cases.length;
  const automated = cases.filter((c) =>
    ["full", "partial"].includes(c.automationStatus),
  );
  const automationPct =
    totalCases === 0 ? 0 : Math.round((automated.length / totalCases) * 100);

  // coverage by area
  const areaMap = new Map<
    string,
    { name: string; key: string; total: number; automated: number; lastExecuted: Date | null }
  >();
  for (const c of cases) {
    const k = c.feature.areaId;
    const a = areaMap.get(k) ?? {
      name: c.feature.area.name,
      key: c.feature.area.key,
      total: 0,
      automated: 0,
      lastExecuted: null,
    };
    a.total++;
    if (["full", "partial"].includes(c.automationStatus)) a.automated++;
    areaMap.set(k, a);
  }

  const lastExec = await prisma.testExecution.groupBy({
    by: ["snapshotCaseId"],
    _max: { executedAt: true },
    where: {
      run: { projectId },
      result: { not: "not_run" },
    },
  });

  // map snapshot -> case via runSnapshotCase
  const snapToCase = new Map(
    (
      await prisma.runSnapshotCase.findMany({
        where: { run: { projectId } },
        select: { id: true, testCaseId: true },
      })
    ).map((s) => [s.id, s.testCaseId]),
  );
  const lastExecByCase = new Map<string, Date | null>();
  for (const row of lastExec) {
    const caseId = snapToCase.get(row.snapshotCaseId);
    if (!caseId) continue;
    const prev = lastExecByCase.get(caseId);
    if (!prev || (row._max.executedAt && row._max.executedAt > prev)) {
      lastExecByCase.set(caseId, row._max.executedAt);
    }
  }

  // execution stats: count of runs per case + fail count
  const execStats = await prisma.testExecution.groupBy({
    by: ["snapshotCaseId", "result"],
    _count: { _all: true },
    where: { run: { projectId } },
  });
  const caseRuns = new Map<string, number>();
  const caseFails = new Map<string, number>();
  for (const row of execStats) {
    const caseId = snapToCase.get(row.snapshotCaseId);
    if (!caseId) continue;
    if (row.result !== "not_run") {
      caseRuns.set(caseId, (caseRuns.get(caseId) ?? 0) + row._count._all);
    }
    if (row.result === "fail") {
      caseFails.set(caseId, (caseFails.get(caseId) ?? 0) + row._count._all);
    }
  }

  // automation candidates: rank manual cases by score
  const candidateScores = cases
    .filter((c) => c.automationStatus === "not_automated" && c.status === "active")
    .map((c) => {
      const runs = caseRuns.get(c.id) ?? 0;
      const fails = caseFails.get(c.id) ?? 0;
      const failRate = runs === 0 ? 0 : fails / runs;
      const stepLoad = Math.min(1, c.steps.length / 10);
      const priorityScore = PRIORITY_WEIGHT[c.priority] ?? 1;
      const score =
        priorityScore * 25 +
        Math.min(runs, 20) * 4 +
        failRate * 60 +
        stepLoad * 15;
      return { c, runs, fails, failRate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  // top failing cases (last 90 days, all runs)
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const recentFails = await prisma.testExecution.groupBy({
    by: ["snapshotCaseId"],
    _count: { _all: true },
    where: {
      run: { projectId },
      result: "fail",
      executedAt: { gte: since },
    },
    orderBy: { _count: { snapshotCaseId: "desc" } },
    take: 20,
  });
  const topFailing: { caseId: string; count: number }[] = [];
  for (const r of recentFails) {
    const cid = snapToCase.get(r.snapshotCaseId);
    if (!cid) continue;
    topFailing.push({ caseId: cid, count: r._count._all });
  }
  const caseById = new Map(cases.map((c) => [c.id, c]));

  // Stale automation
  const staleSince = new Date();
  staleSince.setDate(staleSince.getDate() - 90);
  const staleAutomation = cases.filter(
    (c) =>
      ["full", "partial"].includes(c.automationStatus) &&
      (!c.automationLastReviewedAt ||
        c.automationLastReviewedAt < staleSince),
  );

  // Stale manual cases (not executed in 60d)
  const staleManualSince = new Date();
  staleManualSince.setDate(staleManualSince.getDate() - 60);
  const staleManual = cases
    .filter((c) => c.automationStatus === "not_automated" && c.status === "active")
    .filter((c) => {
      const last = lastExecByCase.get(c.id);
      return !last || last < staleManualSince;
    })
    .slice(0, 20);

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
        <KPICard label="Total cases" value={totalCases.toString()} />
        <KPICard
          label="Automation rate"
          value={`${automationPct}%`}
          subtitle={`${automated.length} automated`}
        />
        <KPICard
          label="Areas covered"
          value={areaMap.size.toString()}
          subtitle={`${cases.length === 0 ? 0 : Math.round((cases.filter(c => c.steps.length > 0).length / cases.length) * 100)}% with steps`}
        />
        <KPICard
          label="Cases recently run"
          value={lastExecByCase.size.toString()}
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
            {candidateScores.length === 0 ? (
              <p className="p-6 text-sm text-(--muted)">
                No manual cases to recommend. Try seeding more data or running tests first.
              </p>
            ) : (
              <table className="min-w-full text-sm" data-testid="candidates-table">
                <thead className="border-b border-(--border) bg-(--bg) text-left">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">#</th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                      Case
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                      Priority
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                      Runs
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                      Fail %
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidateScores.map((row, i) => (
                    <tr
                      key={row.c.id}
                      className="border-b border-(--border) hover:bg-(--accent-soft)"
                    >
                      <td className="px-3 py-2 text-xs text-(--muted)">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/projects/${projectId}/cases/${row.c.id}`}
                          className="hover:text-(--accent)"
                        >
                          <span className="font-mono text-xs text-(--muted)">
                            {row.c.publicId}
                          </span>{" "}
                          <span className="font-medium">{row.c.title}</span>
                        </Link>
                        <div className="text-[11px] text-(--muted)">
                          {row.c.feature.area.name} › {row.c.feature.name}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={priorityTone(row.c.priority)}>
                          {row.c.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.runs}</td>
                      <td className="px-3 py-2 text-xs">
                        {Math.round(row.failRate * 100)}%
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {Math.round(row.score)}
                      </td>
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
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Area
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Cases
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Automation %
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...areaMap.values()]
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <tr
                      key={a.key}
                      className="border-b border-(--border)"
                    >
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
                              style={{
                                width:
                                  a.total === 0
                                    ? "0%"
                                    : `${Math.round((a.automated / a.total) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs">
                            {a.total === 0
                              ? "—"
                              : `${Math.round((a.automated / a.total) * 100)}%`}
                          </span>
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
            {topFailing.length === 0 ? (
              <p className="text-sm text-(--muted)">No failures in the last 90 days.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {topFailing.map((row) => {
                  const c = caseById.get(row.caseId);
                  if (!c) return null;
                  return (
                    <li
                      key={row.caseId}
                      className="flex items-center justify-between gap-3 border-b border-(--border) pb-1.5 last:border-0"
                    >
                      <Link
                        href={`/projects/${projectId}/cases/${c.id}`}
                        className="flex flex-1 flex-wrap items-center gap-2 hover:text-(--accent)"
                      >
                        <span className="font-mono text-xs text-(--muted)">
                          {c.publicId}
                        </span>
                        <span>{c.title}</span>
                      </Link>
                      <Badge tone="danger">{row.count} fails</Badge>
                    </li>
                  );
                })}
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
            {staleAutomation.length === 0 ? (
              <p className="text-sm text-(--muted)">
                Nothing is stale. Nice.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {staleAutomation.slice(0, 15).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 border-b border-(--border) pb-1.5 last:border-0"
                  >
                    <Link
                      href={`/projects/${projectId}/cases/${c.id}`}
                      className="flex flex-1 flex-wrap items-center gap-2 hover:text-(--accent)"
                    >
                      <span className="font-mono text-xs text-(--muted)">
                        {c.publicId}
                      </span>
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
            {staleManual.length === 0 ? (
              <p className="text-sm text-(--muted)">
                Every manual case has been run recently.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                {staleManual.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border border-(--border) p-2"
                  >
                    <Link
                      href={`/projects/${projectId}/cases/${c.id}`}
                      className="flex items-center gap-2 hover:text-(--accent)"
                    >
                      <span className="font-mono text-xs text-(--muted)">
                        {c.publicId}
                      </span>
                      <span className="flex-1 truncate">{c.title}</span>
                    </Link>
                    <div className="mt-0.5 text-xs text-(--muted)">
                      {c.feature.area.name} › {c.feature.name} · last run:{" "}
                      {formatDate(lastExecByCase.get(c.id) ?? null)}
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
