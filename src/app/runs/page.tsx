import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, runStatusTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ActiveRunsPage() {
  const runs = await prisma.testRun.findMany({
    where: { status: { in: ["draft", "in_progress", "blocked"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      project: true,
      _count: { select: { executions: true } },
    },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Active runs"
        description="Every run currently draft, in-progress, or blocked, across projects."
      />
      {runs.length === 0 ? (
        <EmptyState
          title="No active runs"
          description="Once a run is created or in progress it'll show here."
        />
      ) : (
        <Card>
          <table className="min-w-full text-sm">
            <thead className="border-b border-(--border) bg-(--bg) text-left">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Project</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Run</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Status</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Env</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Cases</th>
                <th className="px-3 py-2 text-xs font-medium text-(--muted)">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-(--border) hover:bg-(--accent-soft)"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/projects/${r.projectId}`}
                      className="font-medium text-(--fg) hover:text-(--accent)"
                    >
                      {r.project.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/projects/${r.projectId}/runs/${r.id}`}
                      className="hover:text-(--accent)"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={runStatusTone(r.status)}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-(--muted)">
                    {r.environment ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r._count.executions}
                  </td>
                  <td className="px-3 py-2 text-xs text-(--muted)">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
