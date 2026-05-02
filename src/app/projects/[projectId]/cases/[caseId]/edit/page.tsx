import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { TestCaseForm } from "@/components/testcases/TestCaseForm";

export const dynamic = "force-dynamic";

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound();

  const tc = await prisma.testCase.findFirst({
    where: { id: caseId, projectId },
    include: {
      steps: { orderBy: { order: "asc" } },
      parameters: { orderBy: { order: "asc" } },
      dataRows: { orderBy: { order: "asc" } },
      tags: { include: { tag: true } },
    },
  });
  if (!tc) return notFound();

  const features = await prisma.feature.findMany({
    where: { area: { projectId } },
    include: { area: true },
    orderBy: [{ area: { displayOrder: "asc" } }, { displayOrder: "asc" }],
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: tc.publicId, href: `/projects/${projectId}/cases/${caseId}` },
          { label: "Edit" },
        ]}
        title={`Edit ${tc.publicId}`}
        description={tc.title}
      />
      <TestCaseForm
        mode="edit"
        projectId={projectId}
        features={features.map((f) => ({
          id: f.id,
          name: f.name,
          areaName: f.area.name,
        }))}
        initial={{
          id: tc.id,
          projectId,
          featureId: tc.featureId,
          title: tc.title,
          description: tc.description ?? "",
          preconditions: tc.preconditions ?? "",
          finalExpected: tc.finalExpected ?? "",
          testDataNotes: tc.testDataNotes ?? "",
          type: tc.type,
          priority: tc.priority,
          status: tc.status,
          automationStatus: tc.automationStatus,
          automationFramework: tc.automationFramework ?? "",
          automationRef: tc.automationRef ?? "",
          automationRepoUrl: tc.automationRepoUrl ?? "",
          jiraKeys: tc.jiraKeys ?? "",
          tags: tc.tags.map((t) => t.tag.name),
          steps: tc.steps.map((s) => ({ action: s.action, expected: s.expected })),
          parameters: tc.parameters.map((p) => ({ name: p.name })),
          dataRows: tc.dataRows.map((r) => ({
            __label: r.label ?? "",
            ...JSON.parse(r.valuesJson),
          })),
        }}
      />
    </PageContainer>
  );
}
