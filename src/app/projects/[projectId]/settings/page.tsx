import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { MembersManager } from "@/components/projects/MembersManager";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project, members;
  try {
    [project, members] = await Promise.all([
      api.getProject(projectId),
      api.listMembers(projectId),
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
          { label: "Settings" },
        ]}
        title={
          <span className="flex items-center gap-2">
            <Badge tone="default">{project.key}</Badge>
            <span>{project.name} · Members &amp; roles</span>
          </span>
        }
        description="Control who can access this project and what they can do. Roles take effect when authentication enforcement is enabled."
      />
      <MembersManager projectId={projectId} members={members} />
    </PageContainer>
  );
}
