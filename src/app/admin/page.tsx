import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { testCases: true, testRuns: true },
      },
    },
  });

  const statsByProject = await Promise.all(
    projects.map(async (p) => {
      const automated = await prisma.testCase.count({
        where: {
          projectId: p.id,
          deletedAt: null,
          automationStatus: { in: ["full", "partial"] },
        },
      });
      const total = await prisma.testCase.count({
        where: { projectId: p.id, deletedAt: null },
      });
      const activeRuns = await prisma.testRun.count({
        where: {
          projectId: p.id,
          status: { in: ["draft", "in_progress", "blocked"] },
        },
      });
      return { id: p.id, automated, total, activeRuns };
    }),
  );
  const statById = Object.fromEntries(statsByProject.map((s) => [s.id, s]));

  const auditLogs = await prisma.auditLog.findMany({
    take: 25,
    orderBy: { createdAt: "desc" },
    include: { actor: true },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Admin"
        description="Cross-project rollups, recent activity, and (later) integrations + roles."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Automation rate by project" />
          <CardBody className="-m-5 p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-(--border) bg-(--bg) text-left">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Project
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Cases
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Automation %
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Active runs
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const s = statById[p.id];
                  const pct =
                    s.total === 0
                      ? 0
                      : Math.round((s.automated / s.total) * 100);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-(--border) hover:bg-(--accent-soft)"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium hover:text-(--accent)"
                        >
                          <Badge tone="default">{p.key}</Badge>{" "}
                          <span className="ml-1">{p.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">{s.total}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-2 bg-(--accent)"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">{s.activeRuns}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="Last 25 audit events." />
          <CardBody>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-(--muted)">No activity yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {auditLogs.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 border-b border-(--border) py-1.5 last:border-0"
                  >
                    <div>
                      <span className="font-mono text-xs text-(--muted)">
                        {a.action}
                      </span>{" "}
                      <span className="text-xs">{a.entity}</span>
                    </div>
                    <span className="text-xs text-(--muted)">
                      {a.actor?.name ?? "system"} ·{" "}
                      {a.createdAt.toLocaleString()}
                    </span>
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
