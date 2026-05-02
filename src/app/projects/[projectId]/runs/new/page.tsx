import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { NewRunForm } from "@/components/runs/NewRunForm";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
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
    where: { projectId, deletedAt: null, status: { not: "deprecated" } },
    include: {
      feature: { include: { area: true } },
      tags: { include: { tag: true } },
      _count: { select: { dataRows: true } },
    },
    orderBy: [{ feature: { area: { displayOrder: "asc" } } }, { sequenceNum: "asc" }],
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Runs", href: `/projects/${projectId}/runs` },
          { label: "New" },
        ]}
        title="New test run"
        description="Pick the test cases to include. They'll be snapshotted at their current version."
      />
      {cases.length === 0 ? (
        <EmptyState
          title="No active test cases"
          description="Author at least one active test case before creating a run."
          action={
            <Link href={`/projects/${projectId}/cases/new`}>
              <Button>+ New test case</Button>
            </Link>
          }
        />
      ) : (
        <NewRunForm
          projectId={projectId}
          cases={cases.map((c) => ({
            id: c.id,
            publicId: c.publicId,
            title: c.title,
            priority: c.priority,
            type: c.type,
            status: c.status,
            automationStatus: c.automationStatus,
            featureId: c.featureId,
            featureName: c.feature.name,
            areaId: c.feature.areaId,
            areaName: c.feature.area.name,
            dataRowCount: c._count.dataRows,
            tags: c.tags.map((t) => t.tag.name),
          }))}
        />
      )}
    </PageContainer>
  );
}
