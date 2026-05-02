import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Input";

export const dynamic = "force-dynamic";

type SP = {
  q?: string;
  type?: string;
  priority?: string;
  status?: string;
  automation?: string;
  tag?: string;
  feature?: string;
  area?: string;
  archived?: string;
};

export default async function CasesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<SP>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });
  if (!project) return notFound();

  const where: any = {
    projectId,
    deletedAt: sp.archived === "1" ? { not: null } : null,
  };
  if (sp.type && sp.type !== "all") where.type = sp.type;
  if (sp.priority && sp.priority !== "all") where.priority = sp.priority;
  if (sp.status && sp.status !== "all") where.status = sp.status;
  if (sp.automation && sp.automation !== "all")
    where.automationStatus = sp.automation;
  if (sp.feature && sp.feature !== "all") where.featureId = sp.feature;
  if (sp.area && sp.area !== "all") where.feature = { areaId: sp.area };
  if (sp.tag) where.tags = { some: { tag: { name: sp.tag } } };
  if (sp.q) {
    const q = sp.q.trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { publicId: { contains: q } },
      { steps: { some: { action: { contains: q } } } },
      { steps: { some: { expected: { contains: q } } } },
    ];
  }

  const [cases, areas, features, tags] = await Promise.all([
    prisma.testCase.findMany({
      where,
      orderBy: { sequenceNum: "desc" },
      take: 200,
      include: {
        feature: { include: { area: true } },
        tags: { include: { tag: true } },
        _count: { select: { dataRows: true } },
      },
    }),
    prisma.area.findMany({
      where: { projectId },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.feature.findMany({
      where: { area: { projectId } },
      include: { area: true },
      orderBy: [{ area: { displayOrder: "asc" } }, { displayOrder: "asc" }],
    }),
    prisma.tag.findMany({
      where: { cases: { some: { testCase: { projectId } } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Test cases" },
        ]}
        title="Test cases"
        description={`${cases.length} matching · across ${areas.length} areas, ${features.length} features.`}
        actions={
          <Link href={`/projects/${projectId}/cases/new`}>
            <Button>+ New test case</Button>
          </Link>
        }
      />

      <Card>
        <form
          method="get"
          className="grid grid-cols-2 gap-3 border-b border-(--border) p-4 lg:grid-cols-7"
        >
          <Input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by ID, title, step…"
            className="lg:col-span-2"
          />
          <Select name="area" defaultValue={sp.area ?? "all"}>
            <option value="all">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select name="feature" defaultValue={sp.feature ?? "all"}>
            <option value="all">All features</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.area.name} › {f.name}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={sp.priority ?? "all"}>
            <option value="all">Any priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select name="automation" defaultValue={sp.automation ?? "all"}>
            <option value="all">Any automation</option>
            <option value="not_automated">Not automated</option>
            <option value="partial">Partially automated</option>
            <option value="full">Fully automated</option>
          </Select>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
            <Link
              href={`/projects/${projectId}/cases`}
              className="text-xs text-(--muted) hover:text-(--accent)"
            >
              Reset
            </Link>
          </div>
        </form>

        {cases.length === 0 ? (
          <div className="p-10 text-center text-sm text-(--muted)">
            No test cases match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="cases-table">
            <table className="min-w-full text-sm">
              <thead className="border-b border-(--border) bg-(--bg) text-left">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Title
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Feature
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Priority
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Status
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">
                    Automation
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-(--border) hover:bg-(--accent-soft)"
                    data-testid="case-row"
                    data-case-id={c.publicId}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/projects/${projectId}/cases/${c.id}`}
                        className="hover:text-(--accent)"
                      >
                        {c.publicId}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/projects/${projectId}/cases/${c.id}`}
                        className="font-medium text-(--fg) hover:text-(--accent)"
                      >
                        {c.title}
                      </Link>
                      {c._count.dataRows > 0 ? (
                        <span className="ml-2 inline-flex items-center text-[11px] text-(--muted)">
                          ({c._count.dataRows} rows)
                        </span>
                      ) : null}
                      {c.tags.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <Badge key={t.tagId} tone="muted">
                              {t.tag.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--muted)">
                      {c.feature.area.name} › {c.feature.name}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={priorityTone(c.priority)}>{c.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.type}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge
                        tone={c.status === "deprecated" ? "muted" : "default"}
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={automationTone(c.automationStatus)}>
                        {c.automationStatus === "full"
                          ? "automated"
                          : c.automationStatus === "partial"
                            ? "partial"
                            : "manual"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
