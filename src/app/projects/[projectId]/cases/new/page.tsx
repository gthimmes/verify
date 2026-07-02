import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { TestCaseForm } from "@/components/testcases/TestCaseForm";
import { folderOptions } from "@/lib/folders";

export const dynamic = "force-dynamic";

export default async function NewCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ folderId?: string }>;
}) {
  const { projectId } = await params;
  const { folderId } = await searchParams;
  let project, folders, templates;
  try {
    [project, folders, templates] = await Promise.all([
      api.getProject(projectId),
      api.folders(projectId),
      api.listTemplates(),
    ]);
  } catch {
    return notFound();
  }

  const options = folderOptions(folders);

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
        templates={templates}
        folders={options}
        initial={{
          projectId,
          folderId: folderId ?? "",
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
