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
  // The default landing intentionally skips loading every case — for a
  // project with thousands of cases (Firm Portal: ~2.5k) the React render of
  // the full table dominates the response time. Once the user picks a folder
  // or sets any filter, we hit /cases as usual.
  const folderFilter =
    sp.folder && sp.folder !== "all" ? sp.folder : undefined;
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : undefined;
  const priorityFilter =
    sp.priority && sp.priority !== "all" ? sp.priority : undefined;
  const statusFilter =
    sp.status && sp.status !== "all" ? sp.status : undefined;
  const automationFilter =
    sp.automation && sp.automation !== "all" ? sp.automation : undefined;
  const queryFilter = sp.q && sp.q.trim() !== "" ? sp.q.trim() : undefined;
  const tagFilter = sp.tag && sp.tag !== "" ? sp.tag : undefined;
  const hasFilter = Boolean(
    folderFilter ||
      typeFilter ||
      priorityFilter ||
      statusFilter ||
      automationFilter ||
      queryFilter ||
      tagFilter ||
      sp.archived === "1",
  );

  const cases = hasFilter
    ? await api.listCases(projectId, {
        archived: sp.archived === "1" ? "1" : undefined,
        type: typeFilter,
        priority: priorityFilter,
        status: statusFilter,
        automationStatus: automationFilter,
        folderId: folderFilter,
        // When filtering by folder, show only its direct cases — the sidebar
        // numbers reflect this. Descendants stay reachable by drilling in.
        descendants: folderFilter ? "0" : undefined,
        tag: tagFilter,
        q: queryFilter,
        limit: "2500",
      })
    : [];

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
          description={
            hasFilter
              ? `${cases.length} matching · ${countFolders(folders)} folders.`
              : `${summary?.testCaseCount ?? "?"} test cases · ${countFolders(folders)} folders. Pick a folder to start.`
          }
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

        {!hasFilter ? (
          <div
            className="p-10 text-center text-sm text-(--muted)"
            data-testid="cases-pick-folder"
          >
            <p className="text-(--fg)">
              Pick a folder on the left to view its test cases.
            </p>
            <p className="mt-2">
              Or use the search and filters above to query across all{" "}
              {summary?.testCaseCount ?? "—"} cases in this project.
            </p>
          </div>
        ) : cases.length === 0 ? (
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
