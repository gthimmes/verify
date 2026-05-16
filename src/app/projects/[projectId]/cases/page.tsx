import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Input";
import { FolderTree } from "@/components/projects/FolderTree";

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
  folder?: string;
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
  let project, folders, summary;
  try {
    [project, folders, summary] = await Promise.all([
      api.getProject(projectId),
      api.folders(projectId),
      api.listProjects(false).then((all) => all.find((p) => p.id === projectId)),
    ]);
  } catch {
    return notFound();
  }
  const cases = await api.listCases(projectId, {
    archived: sp.archived === "1" ? "1" : undefined,
    type: sp.type === "all" ? undefined : sp.type,
    priority: sp.priority === "all" ? undefined : sp.priority,
    status: sp.status === "all" ? undefined : sp.status,
    automationStatus: sp.automation === "all" ? undefined : sp.automation,
    folderId: sp.folder === "all" ? undefined : sp.folder,
    tag: sp.tag,
    q: sp.q,
    limit: "2500",
  });

  return (
    <div className="mx-auto flex max-w-[1600px] gap-0">
      <FolderTree
        total={summary?.testCaseCount ?? cases.length}
        roots={folders}
        selectedFolderId={sp.folder ?? null}
        basePath={`/projects/${projectId}/cases`}
      />
      <PageContainer className="flex-1">
        <PageHeader
          breadcrumbs={[
            { label: "Projects", href: "/?list=1" },
            { label: project.name },
          ]}
          title={
            <span className="flex items-center gap-2">
              <Badge tone="default">{project.key}</Badge>
              <span>{project.name}</span>
            </span>
          }
          description={`${cases.length} matching · ${countFolders(folders)} folders.`}
          actions={
            <>
              <Link href={`/projects/${projectId}/overview`}>
                <Button variant="outline">Overview</Button>
              </Link>
              <Link href={`/projects/${projectId}/runs`}>
                <Button variant="outline">Runs</Button>
              </Link>
              <Link href={`/projects/${projectId}/reports`}>
                <Button variant="outline">Reports</Button>
              </Link>
              <Link href={`/projects/${projectId}/cases/new`}>
                <Button data-testid="new-case-cta">+ New test case</Button>
              </Link>
            </>
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
          {sp.folder ? (
            <input type="hidden" name="folder" value={sp.folder} />
          ) : null}
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
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Title</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Feature</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Priority</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Status</th>
                  <th className="px-3 py-2 text-xs font-medium text-(--muted)">Automation</th>
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
                      {c.dataRowCount > 0 ? (
                        <span className="ml-2 inline-flex items-center text-[11px] text-(--muted)">
                          ({c.dataRowCount} rows)
                        </span>
                      ) : null}
                      {c.tags.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <Badge key={t} tone="muted">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--muted)">
                      {c.areaName} › {c.featureName}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={priorityTone(c.priority)}>{c.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.type}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge tone={c.status === "deprecated" ? "muted" : "default"}>
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
    </div>
  );
}

function countFolders(roots: { children: { children?: unknown[] }[] }[]): number {
  let n = 0;
  const walk = (
    nodes: { children: { children?: unknown[] }[] }[],
  ) => {
    for (const node of nodes) {
      n++;
      walk((node.children ?? []) as never);
    }
  };
  walk(roots as never);
  return n;
}
