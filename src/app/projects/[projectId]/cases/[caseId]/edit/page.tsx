import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { TestCaseForm } from "@/components/testcases/TestCaseForm";

export const dynamic = "force-dynamic";

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  let project, tc, features, areas;
  try {
    [project, tc, features, areas] = await Promise.all([
      api.getProject(projectId),
      api.getCase(caseId),
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
          areaName: areas.find((a) => a.id === f.areaId)?.name ?? "?",
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
          tags: tc.tags,
          steps: tc.steps.map((s) => ({ action: s.action, expected: s.expected })),
          parameters: tc.parameters.map((p) => ({ name: p.name })),
          dataRows: tc.dataRows.map((r) => ({
            __label: r.label ?? "",
            ...r.values,
          })),
        }}
      />
    </PageContainer>
  );
}
