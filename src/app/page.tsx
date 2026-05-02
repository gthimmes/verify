import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, ...(showArchived ? {} : { status: "active" }) },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { testCases: true, testRuns: true, areas: true } },
    },
  });

  const projectStats = await Promise.all(
    projects.map(async (p) => {
      const [activeRuns, automated] = await Promise.all([
        prisma.testRun.count({
          where: {
            projectId: p.id,
            status: { in: ["draft", "in_progress", "blocked"] },
          },
        }),
        prisma.testCase.count({
          where: {
            projectId: p.id,
            deletedAt: null,
            automationStatus: { in: ["full", "partial"] },
          },
        }),
      ]);
      return { id: p.id, activeRuns, automated };
    }),
  );
  const statsById = Object.fromEntries(projectStats.map((s) => [s.id, s]));

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Each project owns its own test catalog, runs, and reports."
        actions={
          <>
            <Link
              className="text-sm text-(--muted) hover:text-(--accent)"
              href={showArchived ? "/" : "/?archived=1"}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Link>
            <NewProjectButton />
          </>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to start authoring test cases and tracking runs."
          action={<NewProjectButton />}
        />
      ) : (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          data-testid="project-grid"
        >
          {projects.map((p) => {
            const s = statsById[p.id];
            const automationPct =
              p._count.testCases === 0
                ? null
                : Math.round(((s?.automated ?? 0) / p._count.testCases) * 100);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group"
                data-testid="project-card"
                data-project-key={p.key}
              >
                <Card className="h-full transition-all hover:border-(--accent) hover:shadow-sm">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge tone="default">{p.key}</Badge>
                          {p.status === "archived" ? (
                            <Badge tone="muted">archived</Badge>
                          ) : null}
                        </div>
                        <h3 className="mt-2 font-semibold text-(--fg) group-hover:text-(--accent)">
                          {p.name}
                        </h3>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[2.5em] text-sm text-(--muted)">
                      {p.description ?? "No description."}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-(--muted)">
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p._count.testCases}
                        </div>
                        <div>Test cases</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p._count.areas}
                        </div>
                        <div>Areas</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p._count.testRuns}
                        </div>
                        <div>Runs</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {s?.activeRuns ?? 0}
                        </div>
                        <div>Active</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-(--border) pt-3 text-xs text-(--muted)">
                      <span>Updated {formatDate(p.updatedAt)}</span>
                      <span>{automationPct === null ? "—" : `${automationPct}% automated`}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
