import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
} from "@/components/ui/PageHeader";
import { NewAreaButton } from "@/components/projects/NewAreaButton";
import { NewFeatureButton } from "@/components/projects/NewFeatureButton";
import { AreaActions } from "@/components/projects/AreaActions";
import { FeatureActions } from "@/components/projects/FeatureActions";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });
  if (!project) return notFound();

  const areas = await prisma.area.findMany({
    where: { projectId },
    orderBy: { displayOrder: "asc" },
    include: {
      features: {
        orderBy: { displayOrder: "asc" },
        include: {
          _count: { select: { testCases: { where: { deletedAt: null } } } },
          testCases: {
            where: { deletedAt: null },
            select: {
              id: true,
              publicId: true,
              title: true,
              priority: true,
              automationStatus: true,
              status: true,
              type: true,
            },
            orderBy: { sequenceNum: "asc" },
            take: 5,
          },
        },
      },
    },
  });

  const totalCases = await prisma.testCase.count({
    where: { projectId, deletedAt: null },
  });
  const automatedCount = await prisma.testCase.count({
    where: { projectId, deletedAt: null, automationStatus: { in: ["full", "partial"] } },
  });
  const activeRuns = await prisma.testRun.count({
    where: { projectId, status: { in: ["draft", "in_progress", "blocked"] } },
  });
  const automationPct =
    totalCases === 0 ? 0 : Math.round((automatedCount / totalCases) * 100);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name },
        ]}
        title={
          <span className="flex items-center gap-2">
            <Badge tone="default">{project.key}</Badge>
            <span>{project.name}</span>
          </span>
        }
        description={project.description}
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
          label="Areas"
          value={areas.length.toString()}
          subtitle={`${areas.reduce((s, a) => s + a.features.length, 0)} features`}
        />
        <KPI
          label="Active runs"
          value={activeRuns.toString()}
          href={`/projects/${projectId}/runs`}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-(--fg)">Hierarchy</h2>
        <NewAreaButton projectId={projectId} />
      </div>

      {areas.length === 0 ? (
        <EmptyState
          title="No areas yet"
          description="Areas group features (e.g. Payments → Refunds, Calendar → Recurring Events). Start with one area."
          action={<NewAreaButton projectId={projectId} />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {areas.map((area) => (
            <Card key={area.id} className={area.archived ? "opacity-60" : ""}>
              <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
                <div className="flex items-center gap-3">
                  <Badge tone="default">{area.key}</Badge>
                  <h3 className="text-sm font-semibold text-(--fg)">{area.name}</h3>
                  {area.archived ? <Badge tone="muted">archived</Badge> : null}
                  <span className="text-xs text-(--muted)">
                    {area.features.length}{" "}
                    {area.features.length === 1 ? "feature" : "features"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <NewFeatureButton
                    projectId={projectId}
                    areaId={area.id}
                    areaName={area.name}
                  />
                  <AreaActions
                    areaId={area.id}
                    projectId={projectId}
                    archived={area.archived}
                  />
                </div>
              </div>
              {area.features.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-(--muted)">
                  No features yet. Add one to start authoring test cases.
                </div>
              ) : (
                <ul className="divide-y divide-(--border)">
                  {area.features.map((feature) => (
                    <li
                      key={feature.id}
                      className={`px-5 py-3 ${
                        feature.archived ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/projects/${projectId}/features/${feature.id}`}
                            className="block"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-(--fg) hover:text-(--accent)">
                                {feature.name}
                              </span>
                              {feature.archived ? (
                                <Badge tone="muted">archived</Badge>
                              ) : null}
                              <span className="text-xs text-(--muted)">
                                {feature._count.testCases}{" "}
                                {feature._count.testCases === 1
                                  ? "case"
                                  : "cases"}
                              </span>
                            </div>
                            {feature.description ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-(--muted)">
                                {feature.description}
                              </p>
                            ) : null}
                          </Link>
                          {feature.testCases.length > 0 ? (
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {feature.testCases.map((tc) => (
                                <li key={tc.id}>
                                  <Link
                                    href={`/projects/${projectId}/cases/${tc.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-(--border) bg-white px-2 py-1 text-xs hover:border-(--accent) hover:text-(--accent)"
                                  >
                                    <span className="font-mono text-(--muted)">
                                      {tc.publicId}
                                    </span>
                                    <span className="max-w-[200px] truncate">
                                      {tc.title}
                                    </span>
                                    <Badge tone={priorityTone(tc.priority)}>
                                      {tc.priority}
                                    </Badge>
                                    <Badge tone={automationTone(tc.automationStatus)}>
                                      {tc.automationStatus === "full"
                                        ? "automated"
                                        : tc.automationStatus === "partial"
                                          ? "partial"
                                          : "manual"}
                                    </Badge>
                                  </Link>
                                </li>
                              ))}
                              {feature._count.testCases > feature.testCases.length ? (
                                <li>
                                  <Link
                                    href={`/projects/${projectId}/features/${feature.id}`}
                                    className="text-xs text-(--accent) hover:underline"
                                  >
                                    + {feature._count.testCases - feature.testCases.length} more
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          ) : (
                            <Link
                              href={`/projects/${projectId}/cases/new?featureId=${feature.id}`}
                              className="mt-2 inline-block text-xs text-(--accent) hover:underline"
                              data-testid="add-first-case-link"
                            >
                              + Add first test case
                            </Link>
                          )}
                        </div>
                        <FeatureActions
                          featureId={feature.id}
                          projectId={projectId}
                          archived={feature.archived}
                          areas={areas.map((a) => ({ id: a.id, name: a.name }))}
                          currentAreaId={area.id}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs text-(--muted)">
        Created {formatDate(project.createdAt)} · Updated{" "}
        {formatDate(project.updatedAt)}
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
