"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { createTestRun, type RunFormState } from "@/app/actions/testRuns";

const initial: RunFormState = { ok: true };

type CaseLite = {
  id: string;
  publicId: string;
  title: string;
  priority: string;
  type: string;
  status: string;
  automationStatus: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  dataRowCount: number;
  tags: string[];
};

export function NewRunForm({
  projectId,
  cases,
}: {
  projectId: string;
  cases: CaseLite[];
}) {
  const [state, formAction, pending] = useActionState(createTestRun, initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("staging");
  const [build, setBuild] = useState("");
  const [milestone, setMilestone] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  // selection
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(cases.map((c) => c.id)),
  );
  // filters
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [automation, setAutomation] = useState("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("all");

  const allTags = useMemo(() => {
    const s = new Set<string>();
    cases.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [cases]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (priority !== "all" && c.priority !== priority) return false;
      if (type !== "all" && c.type !== type) return false;
      if (automation !== "all" && c.automationStatus !== automation) return false;
      if (tag !== "all" && !c.tags.includes(tag)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.title.toLowerCase().includes(q) &&
          !c.publicId.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [cases, priority, type, automation, tag, search]);

  // Group by folder
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; cases: CaseLite[] }>();
    for (const c of filtered) {
      const g = map.get(c.folderId) ?? {
        name: c.folderPath || c.folderName || "(unfiled)",
        cases: [],
      };
      g.cases.push(c);
      map.set(c.folderId, g);
    }
    return [...map.entries()]
      .map(([folderId, g]) => ({ folderId, folderName: g.name, cases: g.cases }))
      .sort((a, b) => a.folderName.localeCompare(b.folderName));
  }, [filtered]);

  const totalSelected = filtered.filter((c) => selected.has(c.id)).length;
  const totalRows = filtered
    .filter((c) => selected.has(c.id))
    .reduce((s, c) => s + Math.max(1, c.dataRowCount), 0);

  function toggleCase(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleFolder(folderId: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered
        .filter((c) => c.folderId === folderId)
        .forEach((c) => (on ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  }
  function selectAllFiltered(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((c) => (on ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  }

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]"
      data-testid="new-run-form"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input
        type="hidden"
        name="caseIds"
        value={[...selected].join(",")}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Run details" />
          <CardBody className="flex flex-col gap-4">
            <Field
              label="Name"
              required
              error={state.fieldErrors?.name}
              htmlFor="run-name"
            >
              <Input
                id="run-name"
                name="name"
                required
                placeholder="e.g. May staging regression"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="run-name"
              />
            </Field>
            <Field label="Description" htmlFor="run-description">
              <Textarea
                id="run-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Environment" htmlFor="run-env">
              <Input
                id="run-env"
                name="environment"
                placeholder="staging | prod | qa-1"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
              />
            </Field>
            <Field label="Build / version" htmlFor="run-build">
              <Input
                id="run-build"
                name="build"
                placeholder="git SHA, semver, etc."
                value={build}
                onChange={(e) => setBuild(e.target.value)}
              />
            </Field>
            <Field label="Milestone" htmlFor="run-milestone">
              <Input
                id="run-milestone"
                name="milestone"
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned start" htmlFor="planned-start">
                <Input
                  id="planned-start"
                  name="plannedStart"
                  type="date"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                />
              </Field>
              <Field label="Planned end" htmlFor="planned-end">
                <Input
                  id="planned-end"
                  name="plannedEnd"
                  type="date"
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Selection summary"
            description="Selected cases will be snapshotted at their current version."
          />
          <CardBody className="flex flex-col gap-2 text-sm">
            <Stat label="Selected cases" value={totalSelected.toString()} />
            <Stat
              label="Executions to create"
              value={totalRows.toString()}
              hint="Parameterized cases create one per row."
            />
            <Stat
              label="Filtered out"
              value={(cases.length - filtered.length).toString()}
            />
            {state.message ? (
              <div
                role="alert"
                className="rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
              >
                {state.message}
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={pending || totalSelected === 0}
              data-testid="run-submit"
            >
              {pending ? "Creating run…" : `Create run with ${totalSelected} cases`}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Choose test cases"
          description="All cases are selected by default. Filter and deselect what you don't want."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => selectAllFiltered(true)}
                className="text-xs text-(--accent) hover:underline"
              >
                Select all filtered
              </button>
              <button
                type="button"
                onClick={() => selectAllFiltered(false)}
                className="text-xs text-(--muted) hover:text-(--danger)"
              >
                Deselect filtered
              </button>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-2 border-b border-(--border) p-3 lg:grid-cols-5">
          <Input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">Any priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Any type</option>
            <option value="functional">Functional</option>
            <option value="regression">Regression</option>
            <option value="smoke">Smoke</option>
            <option value="integration">Integration</option>
            <option value="exploratory">Exploratory</option>
            <option value="performance">Performance</option>
            <option value="security">Security</option>
            <option value="accessibility">Accessibility</option>
          </Select>
          <Select value={automation} onChange={(e) => setAutomation(e.target.value)}>
            <option value="all">Any automation</option>
            <option value="not_automated">Not automated</option>
            <option value="partial">Partial</option>
            <option value="full">Fully automated</option>
          </Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">Any tag</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {grouped.length === 0 ? (
            <p className="p-6 text-sm text-(--muted)">
              No cases match the current filter.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.folderId} className="border-b border-(--border)">
                <div className="flex items-center gap-2 bg-(--bg) px-4 py-2">
                  <input
                    type="checkbox"
                    checked={group.cases.every((c) => selected.has(c.id))}
                    onChange={(e) => toggleFolder(group.folderId, e.target.checked)}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {group.folderName}
                  </span>
                  <span className="text-xs text-(--muted)">
                    {group.cases.length} cases
                  </span>
                </div>
                <ul>
                  {group.cases.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 px-8 py-1.5 text-sm hover:bg-(--accent-soft)"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleCase(c.id)}
                        data-testid="case-checkbox"
                      />
                      <span className="font-mono text-xs text-(--muted)">
                        {c.publicId}
                      </span>
                      <span className="flex-1 truncate">{c.title}</span>
                      {c.dataRowCount > 0 ? (
                        <span className="text-[11px] text-(--muted)">
                          ×{c.dataRowCount} rows
                        </span>
                      ) : null}
                      <Badge tone={priorityTone(c.priority)}>
                        {c.priority}
                      </Badge>
                      <Badge tone={automationTone(c.automationStatus)}>
                        {c.automationStatus === "full" ? "auto" : c.automationStatus === "partial" ? "partial" : "manual"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </Card>
    </form>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-(--muted)">{label}</span>
      <span className="font-medium">{value}</span>
      {hint ? <span className="ml-2 text-[10px] text-(--muted)">{hint}</span> : null}
    </div>
  );
}
