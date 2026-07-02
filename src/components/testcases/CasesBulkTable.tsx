"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FolderNode, TestCaseLite } from "@/lib/api";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { bulkUpdateCases } from "@/app/actions/testCases";

type FlatFolder = { id: string; label: string };

function flattenFolders(roots: FolderNode[], depth = 0, acc: FlatFolder[] = []): FlatFolder[] {
  for (const f of roots) {
    acc.push({ id: f.id, label: `${"  ".repeat(depth)}${f.name}` });
    if (f.children?.length) flattenFolders(f.children, depth + 1, acc);
  }
  return acc;
}

export function CasesBulkTable({
  projectId,
  cases,
  folders,
  archived = false,
}: {
  projectId: string;
  cases: TestCaseLite[];
  folders: FolderNode[];
  archived?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const [tagInput, setTagInput] = React.useState("");
  const flatFolders = React.useMemo(() => flattenFolders(folders), [folders]);

  const allOnPage = cases.map((c) => c.id);
  const allSelected = selected.size > 0 && allOnPage.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allOnPage));
  }

  type BulkOp =
    | "priority"
    | "status"
    | "automation"
    | "move"
    | "delete"
    | "restore"
    | "addTag"
    | "removeTag";

  function run(op: BulkOp, value?: string) {
    const caseIds = [...selected];
    if (caseIds.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      const res = await bulkUpdateCases({ projectId, caseIds, op, value });
      if (res.ok) {
        setMessage(`Updated ${res.updated} case${res.updated === 1 ? "" : "s"}.`);
        setSelected(new Set());
        router.refresh();
      } else {
        setMessage(res.message ?? "Bulk update failed.");
      }
    });
  }

  return (
    <div className="overflow-x-auto" data-testid="cases-table">
      {selected.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-(--border) bg-(--accent-soft) px-3 py-2 text-sm"
          data-testid="bulk-toolbar"
        >
          <span className="font-medium text-(--accent)" data-testid="bulk-count">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-(--muted) hover:text-(--accent)"
          >
            Clear
          </button>
          <span className="mx-1 h-4 w-px bg-(--border)" />
          <BulkSelect label="Priority…" disabled={pending} onPick={(v) => run("priority", v)}
            options={[["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
          <BulkSelect label="Status…" disabled={pending} onPick={(v) => run("status", v)}
            options={[["draft", "Draft"], ["active", "Active"], ["deprecated", "Deprecated"]]} />
          <BulkSelect label="Automation…" disabled={pending} onPick={(v) => run("automation", v)}
            options={[["not_automated", "Not automated"], ["partial", "Partial"], ["full", "Full"]]} />
          {flatFolders.length > 0 ? (
            <BulkSelect label="Move to…" disabled={pending} onPick={(v) => run("move", v)}
              options={flatFolders.map((f) => [f.id, f.label] as [string, string])} />
          ) : null}
          <span className="mx-1 h-4 w-px bg-(--border)" />
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="tag"
            className="h-8 w-24 text-xs"
            data-testid="bulk-tag-input"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !tagInput.trim()}
            onClick={() => run("addTag", tagInput.trim())}
            data-testid="bulk-add-tag"
          >
            +tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !tagInput.trim()}
            onClick={() => run("removeTag", tagInput.trim())}
          >
            −tag
          </Button>
          <span className="mx-1 h-4 w-px bg-(--border)" />
          {archived ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run("restore")}>
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              data-testid="bulk-delete"
              onClick={() => {
                if (confirm(`Delete ${selected.size} case(s)? They can be restored from the archived view.`))
                  run("delete");
              }}
            >
              Delete
            </Button>
          )}
          {message ? <span className="text-xs text-(--muted)">{message}</span> : null}
        </div>
      ) : null}

      <table className="min-w-full text-sm">
        <thead className="border-b border-(--border) bg-(--bg) text-left">
          <tr>
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={toggleAll}
                data-testid="bulk-select-all"
              />
            </th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">ID</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Title</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Folder</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Priority</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Type</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Status</th>
            <th className="px-3 py-2 text-xs font-medium text-(--muted)">Automation</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const isSel = selected.has(c.id);
            return (
              <tr
                key={c.id}
                className={`border-b border-(--border) hover:bg-(--accent-soft) ${isSel ? "bg-(--accent-soft)" : ""}`}
                data-testid="case-row"
                data-case-id={c.publicId}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.publicId}`}
                    checked={isSel}
                    onChange={() => toggle(c.id)}
                    data-testid="bulk-select-row"
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/projects/${projectId}/cases/${c.id}`} className="hover:text-(--accent)">
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
                  {c.folderPath || c.folderName}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={priorityTone(c.priority)}>{c.priority}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{c.type}</td>
                <td className="px-3 py-2 text-xs">
                  <Badge tone={c.status === "deprecated" ? "muted" : "default"}>{c.status}</Badge>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// BulkSelect is a one-shot dropdown: picking an option fires the action and
// resets back to its placeholder so it can be reused.
function BulkSelect({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: [string, string][];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      className="h-8 w-auto text-xs"
      disabled={disabled}
      value=""
      onChange={(e) => {
        const v = e.target.value;
        if (v) onPick(v);
        e.target.value = "";
      }}
    >
      <option value="">{label}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </Select>
  );
}
