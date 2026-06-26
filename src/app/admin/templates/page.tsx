import { api } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { TemplatesManager } from "@/components/admin/TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesAdminPage() {
  const templates = await api.listTemplates();

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Templates" }]}
        title="Test case templates"
        description="Org-wide scaffolds reused across projects when authoring new cases."
      />
      <TemplatesManager templates={templates} />
    </PageContainer>
  );
}
