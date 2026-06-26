"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { saveTemplate, deleteTemplate } from "@/app/actions/templates";
import type { Template } from "@/lib/api";

type Step = { action: string; expected: string };
type Param = { name: string };

type Draft = {
  id?: string;
  name: string;
  description: string;
  title: string;
  type: string;
  priority: string;
  tagsRaw: string;
  preconditions: string;
  finalExpected: string;
  testDataNotes: string;
  steps: Step[];
  parameters: Param[];
};

function emptyDraft(): Draft {
  return {
    name: "",
    description: "",
    title: "",
    type: "functional",
    priority: "medium",
    tagsRaw: "",
    preconditions: "",
    finalExpected: "",
    testDataNotes: "",
    steps: [{ action: "", expected: "" }],
    parameters: [],
  };
}

function toDraft(t: Template): Draft {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    title: t.body.title,
    type: t.body.type || "functional",
    priority: t.body.priority || "medium",
    tagsRaw: (t.body.tags ?? []).join(", "),
    preconditions: t.body.preconditions,
    finalExpected: t.body.finalExpected,
    testDataNotes: t.body.testDataNotes,
    steps:
      t.body.steps.length > 0
        ? t.body.steps.map((s) => ({ action: s.action, expected: s.expected }))
        : [{ action: "", expected: "" }],
    parameters: t.body.parameters.map((p) => ({ name: p.name })),
  };
}

export function TemplatesManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  function bodyJson(d: Draft) {
    return JSON.stringify({
      title: d.title,
      description: d.description,
      preconditions: d.preconditions,
      finalExpected: d.finalExpected,
      testDataNotes: d.testDataNotes,
      type: d.type,
      priority: d.priority,
      tags: d.tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      steps: d.steps
        .filter((s) => s.action.trim() || s.expected.trim())
        .map((s, i) => ({ order: i + 1, action: s.action, expected: s.expected })),
      parameters: d.parameters
        .filter((p) => p.name.trim())
        .map((p, i) => ({ name: p.name.trim(), order: i + 1 })),
    });
  }

  function submit(formData: FormData) {
    setError(undefined);
    start(async () => {
      const res = await saveTemplate({ ok: true }, formData);
      if (res.ok) {
        setEditing(null);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteTemplate(id);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-(--muted)">
          Reusable scaffolds for new test cases. Pick one on the new-case form to prefill
          steps, classification, and parameters.
        </p>
        {editing === null ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError(undefined);
              setEditing(emptyDraft());
            }}
            data-testid="new-template"
          >
            + New template
          </Button>
        ) : null}
      </div>

      {editing !== null ? (
        <Card>
          <CardHeader title={editing.id ? "Edit template" : "New template"} />
          <CardBody>
            <form action={submit} className="flex flex-col gap-4" data-testid="template-form">
              {editing.id ? <input type="hidden" name="id" value={editing.id} /> : null}
              <input type="hidden" name="bodyJson" value={bodyJson(editing)} />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Template name" required htmlFor="tpl-name">
                  <Input
                    id="tpl-name"
                    name="name"
                    required
                    maxLength={120}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. API endpoint smoke test"
                    data-testid="template-name"
                  />
                </Field>
                <Field label="Default case title" htmlFor="tpl-title" hint="Prefills the new case's title.">
                  <Input
                    id="tpl-title"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Verify {{endpoint}} returns 200"
                  />
                </Field>
              </div>

              <Field label="What this template is for" htmlFor="tpl-desc">
                <Textarea
                  id="tpl-desc"
                  name="description"
                  rows={2}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Shown in the picker so authors know when to use it."
                  data-testid="template-desc"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Type" htmlFor="tpl-type">
                  <Select
                    id="tpl-type"
                    value={editing.type}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                  >
                    <option value="functional">Functional</option>
                    <option value="regression">Regression</option>
                    <option value="smoke">Smoke</option>
                    <option value="integration">Integration</option>
                    <option value="exploratory">Exploratory</option>
                    <option value="performance">Performance</option>
                    <option value="security">Security</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="acceptance">Acceptance</option>
                    <option value="compatibility">Compatibility</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Priority" htmlFor="tpl-priority">
                  <Select
                    id="tpl-priority"
                    value={editing.priority}
                    onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                </Field>
                <Field label="Tags (comma-separated)" htmlFor="tpl-tags">
                  <Input
                    id="tpl-tags"
                    value={editing.tagsRaw}
                    onChange={(e) => setEditing({ ...editing, tagsRaw: e.target.value })}
                    placeholder="smoke, api"
                  />
                </Field>
              </div>

              <Field label="Preconditions" htmlFor="tpl-pre">
                <Textarea
                  id="tpl-pre"
                  rows={2}
                  value={editing.preconditions}
                  onChange={(e) => setEditing({ ...editing, preconditions: e.target.value })}
                />
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
                    Steps
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({ ...editing, steps: [...editing.steps, { action: "", expected: "" }] })
                    }
                    data-testid="tpl-add-step"
                  >
                    + Step
                  </Button>
                </div>
                <ol className="flex flex-col gap-2">
                  {editing.steps.map((s, i) => (
                    <li key={i} className="grid grid-cols-[28px_1fr_1fr_auto] gap-2">
                      <div className="flex h-9 items-center justify-center rounded-md border border-(--border) bg-(--bg) text-xs font-semibold text-(--muted)">
                        {i + 1}
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Action"
                        value={s.action}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((r, j) =>
                              j === i ? { ...r, action: e.target.value } : r,
                            ),
                          })
                        }
                      />
                      <Textarea
                        rows={2}
                        placeholder="Expected result"
                        value={s.expected}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((r, j) =>
                              j === i ? { ...r, expected: e.target.value } : r,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })
                        }
                        className="text-(--muted) hover:text-(--danger)"
                        aria-label="remove step"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
                    Parameters
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        parameters: [
                          ...editing.parameters,
                          { name: `column_${editing.parameters.length + 1}` },
                        ],
                      })
                    }
                  >
                    + Column
                  </Button>
                </div>
                {editing.parameters.length === 0 ? (
                  <p className="text-xs text-(--muted)">
                    No parameters. Add columns for data-driven cases.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {editing.parameters.map((p, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          className="h-8 w-40 text-xs"
                          value={p.name}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              parameters: editing.parameters.map((r, j) =>
                                j === i ? { name: e.target.value } : r,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              parameters: editing.parameters.filter((_, j) => j !== i),
                            })
                          }
                          className="text-(--muted) hover:text-(--danger)"
                          aria-label="remove column"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Final expected result" htmlFor="tpl-final">
                <Textarea
                  id="tpl-final"
                  rows={2}
                  value={editing.finalExpected}
                  onChange={(e) => setEditing({ ...editing, finalExpected: e.target.value })}
                />
              </Field>

              <Field label="Test data notes" htmlFor="tpl-notes">
                <Textarea
                  id="tpl-notes"
                  rows={2}
                  value={editing.testDataNotes}
                  onChange={(e) => setEditing({ ...editing, testDataNotes: e.target.value })}
                />
              </Field>

              {error ? (
                <div
                  role="alert"
                  className="rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
                >
                  {error}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending} data-testid="template-submit">
                  {pending ? "Saving…" : editing.id ? "Save changes" : "Create template"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={`Templates (${templates.length})`} />
        <CardBody>
          {templates.length === 0 ? (
            <p className="text-sm text-(--muted)">
              No templates yet. Create one to speed up authoring.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-(--border)">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  data-testid="template-row"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <Badge tone="muted">{t.body.priority}</Badge>
                      <Badge tone="default">{t.body.type}</Badge>
                      <span className="text-xs text-(--muted)">
                        {t.body.steps.length} step{t.body.steps.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {t.description ? (
                      <p className="mt-0.5 truncate text-sm text-(--muted)">{t.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setError(undefined);
                        setEditing(toDraft(t));
                      }}
                      data-testid="template-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => remove(t.id)}
                      data-testid="template-delete"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
