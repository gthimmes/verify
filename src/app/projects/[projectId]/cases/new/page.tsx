import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  PageContainer,
  PageHeader,
} from "@/components/ui/PageHeader";
import { TestCaseForm } from "@/components/testcases/TestCaseForm";

export const dynamic = "force-dynamic";

export default async function NewCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ featureId?: string }>;
}) {
  const { projectId } = await params;
  const { featureId } = await searchParams;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });
  if (!project) return notFound();
  const features = await prisma.feature.findMany({
    where: { area: { projectId }, archived: false },
    include: { area: true },
    orderBy: [{ area: { displayOrder: "asc" } }, { displayOrder: "asc" }],
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "New test case" },
        ]}
        title="New test case"
        description="Define what to test and how to verify it. Capture automation metadata even if it's manual today."
      />
      <TestCaseForm
        mode="create"
        projectId={projectId}
        features={features.map((f) => ({
          id: f.id,
          name: f.name,
          areaName: f.area.name,
        }))}
        initial={{
          projectId,
          featureId: featureId ?? "",
          title: "",
          description: "",
          preconditions: "",
          finalExpected: "",
          testDataNotes: "",
          type: "functional",
          priority: "medium",
          status: "active",
          automationStatus: "not_automated",
          automationFramework: "",
          automationRef: "",
          automationRepoUrl: "",
          jiraKeys: "",
          tags: [],
          steps: [{ action: "", expected: "" }],
          parameters: [],
          dataRows: [],
        }}
      />
    </PageContainer>
  );
}
