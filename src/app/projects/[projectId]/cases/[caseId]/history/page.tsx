import Link from "next/link";
import { notFound } from "next/navigation";
import { api, type CaseVersion, type TestCaseInput } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Change = { label: string; from: string; to: string };

export default async function CaseHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  let tc, metas;
  try {
    [tc, metas] = await Promise.all([
      api.getCase(caseId),
      api.listCaseVersions(caseId),
    ]);
  } catch {
    return notFound();
  }

  // Pull every version's snapshot so we can diff each against its predecessor.
  const versions = await Promise.all(
    metas.map((m) => api.getCaseVersion(caseId, m.version)),
  );
  // newest-first already (store orders desc); index by version for predecessor lookup.
  const byVersion = new Map<number, CaseVersion>();
  versions.forEach((v) => byVersion.set(v.version, v));

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/?list=1" },
          { label: tc.projectName, href: `/projects/${projectId}` },
          { label: "Cases", href: `/projects/${projectId}/cases` },
          { label: tc.publicId, href: `/projects/${projectId}/cases/${tc.id}` },
          { label: "History" },
        ]}
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono text-sm text-(--muted)">{tc.publicId}</span>
            <span>Edit history</span>
          </span>
        }
        description={
          <span className="text-xs text-(--muted)">
            {metas.length} version{metas.length === 1 ? "" : "s"} · newest first
          </span>
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-0 p-0">
          {versions.map((v) => {
            const prev = byVersion.get(v.version - 1);
            const changes = prev ? diffSnapshots(prev.snapshot, v.snapshot) : null;
            const isCurrent = v.version === tc.version;
            return (
              <div
                key={v.version}
                className="border-b border-(--border) p-4 last:border-b-0"
                data-testid="version-entry"
                data-version={v.version}
              >
                <div className="flex items-center gap-2">
                  <Badge tone={isCurrent ? "default" : "muted"}>v{v.version}</Badge>
                  {isCurrent ? <Badge tone="info">current</Badge> : null}
                  <span className="text-sm font-medium">{v.snapshot.title}</span>
                  <span className="ml-auto text-xs text-(--muted)">
                    {v.changedByName || "?"} · {formatDateTime(v.changedAt)}
                  </span>
                </div>
                <div className="mt-2 pl-1 text-sm">
                  {changes === null ? (
                    <span className="text-xs text-(--muted)">Initial version.</span>
                  ) : changes.length === 0 ? (
                    <span className="text-xs text-(--muted)">
                      No tracked field changed (metadata-only edit).
                    </span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {changes.map((c) => (
                        <li key={c.label} className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                          <span className="font-medium text-(--muted)">{c.label}</span>
                          <span>
                            <span className="text-(--danger) line-through">{c.from || "∅"}</span>
                            <span className="mx-1 text-(--muted-2)">→</span>
                            <span className="text-(--success)">{c.to || "∅"}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
          {versions.length === 0 ? (
            <div className="p-6 text-center text-sm text-(--muted)">No history.</div>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-4">
        <Link
          href={`/projects/${projectId}/cases/${tc.id}`}
          className="text-sm text-(--accent) hover:underline"
        >
          ← Back to case
        </Link>
      </div>
    </PageContainer>
  );
}

// diffSnapshots returns the human-meaningful field changes from `a` to `b`.
function diffSnapshots(a: TestCaseInput, b: TestCaseInput): Change[] {
  const changes: Change[] = [];
  const scalar: [string, keyof TestCaseInput][] = [
    ["Title", "title"],
    ["Description", "description"],
    ["Preconditions", "preconditions"],
    ["Final expected", "finalExpected"],
    ["Test data notes", "testDataNotes"],
    ["Type", "type"],
    ["Priority", "priority"],
    ["Status", "status"],
    ["Automation", "automationStatus"],
    ["Framework", "automationFramework"],
    ["Reference", "automationRef"],
    ["Repo URL", "automationRepoUrl"],
    ["Jira keys", "jiraKeys"],
  ];
  for (const [label, key] of scalar) {
    const from = String(a[key] ?? "");
    const to = String(b[key] ?? "");
    if (from !== to) changes.push({ label, from: clip(from), to: clip(to) });
  }

  const aTags = [...(a.tags ?? [])].sort().join(", ");
  const bTags = [...(b.tags ?? [])].sort().join(", ");
  if (aTags !== bTags) changes.push({ label: "Tags", from: aTags, to: bTags });

  if (stepsSig(a) !== stepsSig(b)) {
    changes.push({
      label: "Steps",
      from: `${a.steps?.length ?? 0} step(s)`,
      to: `${b.steps?.length ?? 0} step(s)`,
    });
  }

  const aParams = (a.parameters ?? []).map((p) => p.name).join(", ");
  const bParams = (b.parameters ?? []).map((p) => p.name).join(", ");
  if (aParams !== bParams) changes.push({ label: "Parameters", from: aParams, to: bParams });

  if ((a.dataRows?.length ?? 0) !== (b.dataRows?.length ?? 0)) {
    changes.push({
      label: "Data rows",
      from: `${a.dataRows?.length ?? 0} row(s)`,
      to: `${b.dataRows?.length ?? 0} row(s)`,
    });
  }

  return changes;
}

function stepsSig(t: TestCaseInput): string {
  return (t.steps ?? []).map((s) => `${s.action}→${s.expected}`).join("|");
}

function clip(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? flat.slice(0, 77) + "…" : flat;
}
