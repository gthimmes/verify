"use client";

import { useActionState, useState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import {
  createTestCase,
  updateTestCase,
  type TestCaseFormState,
} from "@/app/actions/testCases";

type FeatureOption = { id: string; name: string; areaName: string };

export type TestCaseFormInitial = {
  id?: string;
  projectId: string;
  featureId: string;
  title: string;
  description: string;
  preconditions: string;
  finalExpected: string;
  testDataNotes: string;
  type: string;
  priority: string;
  status: string;
  automationStatus: string;
  automationFramework: string;
  automationRef: string;
  automationRepoUrl: string;
  jiraKeys: string;
  tags: string[];
  steps: { action: string; expected: string }[];
  parameters: { name: string }[];
  dataRows: Record<string, string>[];
};

const initialState: TestCaseFormState = { ok: true };

export function TestCaseForm({
  mode,
  initial,
  features,
  projectId,
}: {
  mode: "create" | "edit";
  initial: TestCaseFormInitial;
  features: FeatureOption[];
  projectId: string;
}) {
  const submit = mode === "create" ? createTestCase : updateTestCase;
  const [state, formAction, pending] = useActionState(submit, initialState);

  const [featureId, setFeatureId] = useState(initial.featureId);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [preconditions, setPreconditions] = useState(initial.preconditions);
  const [finalExpected, setFinalExpected] = useState(initial.finalExpected);
  const [testDataNotes, setTestDataNotes] = useState(initial.testDataNotes);
  const [type, setType] = useState(initial.type);
  const [priority, setPriority] = useState(initial.priority);
  const [status, setStatus] = useState(initial.status);
  const [automationStatus, setAutomationStatus] = useState(initial.automationStatus);
  const [automationFramework, setAutomationFramework] = useState(
    initial.automationFramework,
  );
  const [automationRef, setAutomationRef] = useState(initial.automationRef);
  const [automationRepoUrl, setAutomationRepoUrl] = useState(
    initial.automationRepoUrl,
  );
  const [jiraKeys, setJiraKeys] = useState(initial.jiraKeys);
  const [tagsRaw, setTagsRaw] = useState(initial.tags.join(", "));
  const [steps, setSteps] = useState(
    initial.steps.length > 0 ? initial.steps : [{ action: "", expected: "" }],
  );
  const [parameters, setParameters] = useState(initial.parameters);
  const [dataRows, setDataRows] = useState(initial.dataRows);

  const formId = useId();

  function addStep() {
    setSteps((s) => [...s, { action: "", expected: "" }]);
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, j) => j !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addParam() {
    const name = `column_${parameters.length + 1}`;
    setParameters((p) => [...p, { name }]);
    setDataRows((rows) => rows.map((r) => ({ ...r, [name]: "" })));
  }
  function removeParam(i: number) {
    const removed = parameters[i].name;
    setParameters((p) => p.filter((_, j) => j !== i));
    setDataRows((rows) =>
      rows.map((r) => {
        const copy = { ...r };
        delete copy[removed];
        return copy;
      }),
    );
  }
  function renameParam(i: number, name: string) {
    const old = parameters[i].name;
    setParameters((p) => p.map((c, j) => (j === i ? { ...c, name } : c)));
    setDataRows((rows) =>
      rows.map((r) => {
        const copy = { ...r };
        copy[name] = copy[old] ?? "";
        if (old !== name) delete copy[old];
        return copy;
      }),
    );
  }
  function addRow() {
    const blank: Record<string, string> = { __label: "" };
    parameters.forEach((p) => (blank[p.name] = ""));
    setDataRows((rows) => [...rows, blank]);
  }
  function removeRow(i: number) {
    setDataRows((rows) => rows.filter((_, j) => j !== i));
  }
  function setRowCell(i: number, key: string, val: string) {
    setDataRows((rows) =>
      rows.map((r, j) => (j === i ? { ...r, [key]: val } : r)),
    );
  }

  return (
    <form
      action={formAction}
      id={formId}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      data-testid="test-case-form"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="stepsJson" value={JSON.stringify(steps)} />
      <input
        type="hidden"
        name="parametersJson"
        value={JSON.stringify(parameters)}
      />
      <input type="hidden" name="dataRowsJson" value={JSON.stringify(dataRows)} />
      <input
        type="hidden"
        name="tags"
        value={tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(",")}
      />

      {/* Left column: Definition */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Identification" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Title"
              required
              htmlFor="title"
              className="md:col-span-2"
              error={state.fieldErrors?.title}
            >
              <Input
                id="title"
                name="title"
                required
                minLength={2}
                maxLength={240}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Refund a successful credit card payment"
                data-testid="case-title"
              />
            </Field>
            <Field
              label="Feature"
              required
              htmlFor="featureId"
              error={state.fieldErrors?.featureId}
            >
              <Select
                id="featureId"
                name="featureId"
                value={featureId}
                onChange={(e) => setFeatureId(e.target.value)}
                required
                data-testid="case-feature"
              >
                <option value="">— Select a feature —</option>
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.areaName} › {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags (comma-separated)" htmlFor="tags-display">
              <Input
                id="tags-display"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="smoke, regression, P0"
                data-testid="case-tags"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Description & preconditions"
            description="Markdown is allowed."
          />
          <CardBody className="grid grid-cols-1 gap-4">
            <Field label="Description / objective" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this test verifying?"
                rows={3}
                data-testid="case-description"
              />
            </Field>
            <Field label="Preconditions" htmlFor="preconditions">
              <Textarea
                id="preconditions"
                name="preconditions"
                value={preconditions}
                onChange={(e) => setPreconditions(e.target.value)}
                placeholder="What state must the system be in before running this case?"
                rows={3}
              />
            </Field>
            <Field
              label="Test data notes"
              htmlFor="testDataNotes"
              hint="Free-form. For structured data, use the parameter schema below."
            >
              <Textarea
                id="testDataNotes"
                name="testDataNotes"
                value={testDataNotes}
                onChange={(e) => setTestDataNotes(e.target.value)}
                rows={2}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Steps"
            description="Each step has an action and the expected result. Use {{column_name}} to reference parameters."
            actions={
              <Button type="button" size="sm" variant="outline" onClick={addStep} data-testid="add-step">
                + Step
              </Button>
            }
          />
          <CardBody>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[28px_1fr_1fr_auto] gap-2">
                  <div className="flex h-9 items-center justify-center rounded-md border border-(--border) bg-(--bg) text-xs font-semibold text-(--muted)">
                    {i + 1}
                  </div>
                  <Textarea
                    placeholder="Action"
                    rows={2}
                    value={s.action}
                    onChange={(e) =>
                      setSteps((arr) =>
                        arr.map((row, j) =>
                          j === i ? { ...row, action: e.target.value } : row,
                        ),
                      )
                    }
                    data-testid={`step-action-${i}`}
                  />
                  <Textarea
                    placeholder="Expected result"
                    rows={2}
                    value={s.expected}
                    onChange={(e) =>
                      setSteps((arr) =>
                        arr.map((row, j) =>
                          j === i ? { ...row, expected: e.target.value } : row,
                        ),
                      )
                    }
                    data-testid={`step-expected-${i}`}
                  />
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(i, -1)}
                      className="text-(--muted) hover:text-(--accent)"
                      aria-label="move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(i, 1)}
                      className="text-(--muted) hover:text-(--accent)"
                      aria-label="move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-(--muted) hover:text-(--danger)"
                      aria-label="remove"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-3">
              <Field label="Final expected result (overall)" htmlFor="finalExpected">
                <Textarea
                  id="finalExpected"
                  name="finalExpected"
                  value={finalExpected}
                  onChange={(e) => setFinalExpected(e.target.value)}
                  rows={2}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Parameter schema & data set"
            description="Optional. Define columns for parameterized cases; each row produces its own execution in a run."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addParam}
                  data-testid="add-param"
                >
                  + Column
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  disabled={parameters.length === 0}
                  data-testid="add-row"
                >
                  + Row
                </Button>
              </div>
            }
          />
          <CardBody>
            {parameters.length === 0 ? (
              <p className="text-xs text-(--muted)">
                No parameters defined. Add a column to define a data-driven case.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--border)">
                      <th className="px-2 py-2 text-left text-xs font-medium text-(--muted)">
                        Label
                      </th>
                      {parameters.map((p, i) => (
                        <th key={i} className="px-2 py-2 text-left">
                          <div className="flex items-center gap-1">
                            <Input
                              value={p.name}
                              className="h-7 text-xs"
                              onChange={(e) => renameParam(i, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => removeParam(i)}
                              className="text-(--muted) hover:text-(--danger)"
                              aria-label="remove column"
                            >
                              ✕
                            </button>
                          </div>
                        </th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((r, i) => (
                      <tr key={i} className="border-b border-(--border)">
                        <td className="px-2 py-1">
                          <Input
                            placeholder="row label"
                            className="h-7 text-xs"
                            value={r.__label ?? ""}
                            onChange={(e) =>
                              setRowCell(i, "__label", e.target.value)
                            }
                          />
                        </td>
                        {parameters.map((p, j) => (
                          <td key={j} className="px-2 py-1">
                            <Input
                              className="h-7 text-xs"
                              value={r[p.name] ?? ""}
                              onChange={(e) =>
                                setRowCell(i, p.name, e.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="text-(--muted) hover:text-(--danger)"
                            aria-label="remove row"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Right column: Classification + Automation + Linkage */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Classification" />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Type" htmlFor="type">
              <Select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="functional">Functional</option>
                <option value="regression">Regression</option>
                <option value="smoke">Smoke</option>
                <option value="integration">Integration</option>
                <option value="exploratory">Exploratory</option>
                <option value="performance">Performance</option>
                <option value="security">Security</option>
                <option value="accessibility">Accessibility</option>
              </Select>
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select
                id="priority"
                name="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="status" className="col-span-2">
              <Select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="deprecated">Deprecated</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Automation metadata"
            description="Tracked here, not executed in v1. Keep this honest."
          />
          <CardBody className="flex flex-col gap-4">
            <Field label="Automation status" htmlFor="automationStatus">
              <Select
                id="automationStatus"
                name="automationStatus"
                value={automationStatus}
                onChange={(e) => setAutomationStatus(e.target.value)}
                data-testid="case-automation-status"
              >
                <option value="not_automated">Not automated</option>
                <option value="partial">Partially automated</option>
                <option value="full">Fully automated</option>
              </Select>
            </Field>
            <Field label="Framework" htmlFor="automationFramework">
              <Select
                id="automationFramework"
                name="automationFramework"
                value={automationFramework}
                onChange={(e) => setAutomationFramework(e.target.value)}
              >
                <option value="">—</option>
                <option value="Cypress">Cypress</option>
                <option value="Playwright">Playwright</option>
                <option value="JUnit">JUnit</option>
                <option value="Pytest">Pytest</option>
                <option value="Postman">Postman</option>
                <option value="k6">k6</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field
              label="Reference"
              hint="Path or URL of the automated test."
              htmlFor="automationRef"
            >
              <Input
                id="automationRef"
                name="automationRef"
                value={automationRef}
                onChange={(e) => setAutomationRef(e.target.value)}
                placeholder="apps/web-e2e/src/payments/refund.cy.ts"
              />
            </Field>
            <Field label="Repo URL" htmlFor="automationRepoUrl">
              <Input
                id="automationRepoUrl"
                name="automationRepoUrl"
                value={automationRepoUrl}
                onChange={(e) => setAutomationRepoUrl(e.target.value)}
                placeholder="https://github.com/acme/web-e2e"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Linkage" />
          <CardBody>
            <Field
              label="Linked Jira keys"
              hint="Comma-separated, e.g. PROJ-123, PROJ-124"
              htmlFor="jiraKeys"
            >
              <Input
                id="jiraKeys"
                name="jiraKeys"
                value={jiraKeys}
                onChange={(e) => setJiraKeys(e.target.value)}
                placeholder="PROJ-123, PROJ-124"
              />
            </Field>
          </CardBody>
        </Card>

        {state.message ? (
          <div
            role="alert"
            className="rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
          >
            {state.message}
          </div>
        ) : null}

        <div className="sticky bottom-4 flex items-center justify-end gap-2 rounded-md border border-(--border) bg-(--surface) p-3 shadow-sm">
          <Button type="submit" disabled={pending} data-testid="case-submit">
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Create test case"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
