import Link from "next/link";
import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [projects, auditLogs] = await Promise.all([
    api.listProjects(false),
    api.recentAudit(25),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Admin"
        description="Cross-project rollups, recent activity, and (later) integrations + roles."
        actions={
          <Link
            href="/admin/templates"
            className="rounded-md border border-(--border) bg-(--surface) px-3 py-1.5 text-sm font-medium hover:bg-(--accent-soft) hover:text-(--accent)"
            data-testid="admin-templates-link"
          >
            Manage templates
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Automation rate by project" />
          <CardBody className="-m-5 p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-(--border) bg-(--bg) text-left">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Project</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Cases</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Automation %</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Active runs</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const pct =
                    p.testCaseCount === 0
                      ? 0
                      : Math.round((p.automatedCount / p.testCaseCount) * 100);
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
                      <td className="px-3 py-2 text-xs">{p.testCaseCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-(--border)">
                            <div
                              className="h-2 bg-(--accent)"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">{p.activeRunCount}</td>
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
                      <span className="font-mono text-xs text-(--muted)">{a.action}</span>{" "}
                      <span className="text-xs">{a.entity}</span>
                    </div>
                    <span className="text-xs text-(--muted)">
                      {a.actorName ?? "system"} · {new Date(a.createdAt).toLocaleString()}
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
