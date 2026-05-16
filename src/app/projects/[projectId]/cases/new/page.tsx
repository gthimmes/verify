import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
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
  let project, features, areas;
  try {
    [project, features, areas] = await Promise.all([
      api.getProject(projectId),
      api.listFeatures(projectId),
      api.listAreas(projectId),
    ]);
  } catch {
    return notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
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
          areaName: areas.find((a) => a.id === f.areaId)?.name ?? "?",
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
