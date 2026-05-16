import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageContainer, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { NewRunForm } from "@/components/runs/NewRunForm";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project, cases;
  try {
    [project, cases] = await Promise.all([
      api.getProject(projectId),
      api.listCases(projectId, { status: "active", limit: "5000" }),
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
            featureName: c.featureName,
            areaId: c.areaId,
            areaName: c.areaName,
            dataRowCount: c.dataRowCount,
            tags: c.tags,
          }))}
        />
      )}
    </PageContainer>
  );
}
