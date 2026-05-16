import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; list?: string }>;
}) {
  const { archived, list } = await searchParams;
  const showArchived = archived === "1";
  const forceList = list === "1" || showArchived;

  // When no explicit "show me the list" query is set, send the user straight
  // to their most-recently-updated active project's folder view. The list
  // remains reachable via /?list=1 (header nav + breadcrumbs) and /?archived=1.
  if (!forceList) {
    const active = await api.listProjects(false);
    if (active.length > 0) {
      const latest = active.reduce((a, b) =>
        new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b,
      );
      redirect(`/projects/${latest.id}/cases`);
    }
  }

  const projects = await api.listProjects(showArchived);

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Each project owns its own test catalog, runs, and reports."
        actions={
          <>
            <Link
              className="text-sm text-(--muted) hover:text-(--accent)"
              href={showArchived ? "/?list=1" : "/?archived=1"}
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
            const automationPct =
              p.testCaseCount === 0
                ? null
                : Math.round((p.automatedCount / p.testCaseCount) * 100);
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
                          {p.testCaseCount}
                        </div>
                        <div>Test cases</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p.areaCount}
                        </div>
                        <div>Areas</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p.runCount}
                        </div>
                        <div>Runs</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-(--fg)">
                          {p.activeRunCount}
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
