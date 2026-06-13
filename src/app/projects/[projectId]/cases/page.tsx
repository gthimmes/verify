import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Input";
import { FolderTree } from "@/components/projects/FolderTree";
import { CasesBulkTable } from "@/components/testcases/CasesBulkTable";
import { SavedFiltersBar } from "@/components/testcases/SavedFiltersBar";

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
  let project, folders, summary, savedFilters;
  try {
    [project, folders, summary, savedFilters] = await Promise.all([
      api.getProject(projectId),
      api.folders(projectId),
      api.listProjects(false).then((all) => all.find((p) => p.id === projectId)),
      api.listSavedFilters(projectId).catch(() => []),
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

  const exportQuery = new URLSearchParams();
  Object.entries({
    q: queryFilter,
    type: typeFilter,
    priority: priorityFilter,
    status: statusFilter,
    automation: automationFilter,
    folder: folderFilter,
    tag: tagFilter,
    archived: sp.archived === "1" ? "1" : undefined,
  }).forEach(([k, v]) => {
    if (v) exportQuery.set(k, String(v));
  });
  const exportHref = `/projects/${projectId}/cases/export${
    exportQuery.toString() ? `?${exportQuery.toString()}` : ""
  }`;

  // currentQuery mirrors the /cases searchParams so a saved filter reloads the
  // exact same view. Only set keys are included.
  const currentQuery: Record<string, string> = {};
  if (queryFilter) currentQuery.q = queryFilter;
  if (typeFilter) currentQuery.type = typeFilter;
  if (priorityFilter) currentQuery.priority = priorityFilter;
  if (statusFilter) currentQuery.status = statusFilter;
  if (automationFilter) currentQuery.automation = automationFilter;
  if (folderFilter) currentQuery.folder = folderFilter;
  if (tagFilter) currentQuery.tag = tagFilter;
  if (sp.archived === "1") currentQuery.archived = "1";

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
            {hasFilter ? (
              <a
                href={exportHref}
                download
                data-testid="export-cases-csv"
                className="text-xs text-(--muted) hover:text-(--accent)"
              >
                Export CSV
              </a>
            ) : null}
          </div>
        </form>

        <SavedFiltersBar
          projectId={projectId}
          filters={savedFilters}
          currentQuery={currentQuery}
          canSave={hasFilter}
        />

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
          <CasesBulkTable
            projectId={projectId}
            cases={cases}
            folders={folders}
            archived={sp.archived === "1"}
          />
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
