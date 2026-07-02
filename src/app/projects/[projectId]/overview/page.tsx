import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
} from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project, folders;
  try {
    [project, folders] = await Promise.all([
      api.getProject(projectId),
      api.folders(projectId),
    ]);
  } catch {
    return notFound();
  }
  const summary = await api
    .listProjects(true)
    .then((all) => all.find((p) => p.id === projectId));

  const totalCases = summary?.testCaseCount ?? 0;
  const automatedCount = summary?.automatedCount ?? 0;
  const activeRuns = summary?.activeRunCount ?? 0;
  const automationPct = totalCases === 0 ? 0 : Math.round((automatedCount / totalCases) * 100);
  const subfolderCount = folders.reduce((s, f) => s + f.children.length, 0);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Overview" },
        ]}
        title={
          <span className="flex items-center gap-2">
            <Badge tone="default">{project.key}</Badge>
            <span>{project.name}</span>
          </span>
        }
        description={project.description ?? undefined}
        actions={
          <>
            <Link href={`/projects/${projectId}/cases`}>
              <Button variant="outline">All test cases</Button>
            </Link>
            <Link href={`/projects/${projectId}/runs`}>
              <Button variant="outline">Runs</Button>
            </Link>
            <Link href={`/projects/${projectId}/reports`}>
              <Button variant="outline">Reports</Button>
            </Link>
            <Link href={`/projects/${projectId}/settings`}>
              <Button variant="outline" data-testid="project-settings-link">Members</Button>
            </Link>
            <Link href={`/projects/${projectId}/cases/new`}>
              <Button data-testid="new-case-cta">+ New test case</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI
          label="Test cases"
          value={totalCases.toString()}
          href={`/projects/${projectId}/cases`}
        />
        <KPI
          label="Automation"
          value={`${automationPct}%`}
          href={`/projects/${projectId}/reports`}
          subtitle={`${automatedCount} of ${totalCases} automated`}
        />
        <KPI
          label="Folders"
          value={folders.length.toString()}
          href={`/projects/${projectId}/cases`}
          subtitle={`${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"}`}
        />
        <KPI
          label="Active runs"
          value={activeRuns.toString()}
          href={`/projects/${projectId}/runs`}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-(--fg)">Folders</h2>
        <span className="text-xs text-(--muted)">
          Create, rename, and move folders from the{" "}
          <Link
            href={`/projects/${projectId}/cases`}
            className="text-(--accent) hover:underline"
          >
            Cases
          </Link>{" "}
          sidebar.
        </span>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          title="No folders yet"
          description="Folders organize your test catalog (e.g. Payments → Refunds). Add one from the Cases sidebar, then file cases under it."
          action={
            <Link href={`/projects/${projectId}/cases`}>
              <Button>Go to Cases</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/projects/${projectId}/cases?folder=${folder.id}`}
              className="block"
              data-testid="overview-folder"
            >
              <Card
                className={`h-full p-4 transition-all hover:border-(--accent) ${
                  folder.archived ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-(--fg)">
                    {folder.name}
                  </h3>
                  {folder.archived ? <Badge tone="muted">archived</Badge> : null}
                </div>
                <div className="mt-1 text-xs text-(--muted)">
                  {folder.caseCount} {folder.caseCount === 1 ? "case" : "cases"}
                  {folder.children.length > 0
                    ? ` · ${folder.children.length} subfolder${
                        folder.children.length === 1 ? "" : "s"
                      }`
                    : ""}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs text-(--muted)">
        Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
      </div>
    </PageContainer>
  );
}

function KPI({
  label,
  value,
  subtitle,
  href,
}: {
  label: string;
  value: string;
  subtitle?: string;
  href?: string;
}) {
  const inner = (
    <Card className="h-full transition-all hover:border-(--accent)">
      <div className="p-4">
        <div className="text-xs text-(--muted)">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-(--fg)">{value}</div>
        {subtitle ? (
          <div className="mt-0.5 text-xs text-(--muted)">{subtitle}</div>
        ) : null}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
