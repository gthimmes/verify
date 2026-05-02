"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, resultTone } from "@/components/ui/Badge";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { recordExecution } from "@/app/actions/executions";

type Step = { order: number; action: string; expected: string };

type ExecutionForExec = {
  id: string;
  result: string;
  comments: string | null;
  durationSeconds: number | null;
  jiraDefectKeys: string | null;
  envOverride: string | null;
  buildOverride: string | null;
  dataRowIndex: number | null;
  dataRowLabel: string | null;
  attempts: { attemptNum: number; result: string; executedAt: Date | null }[];
  values?: Record<string, string>;
  caseSnapshot: {
    publicId: string;
    title: string;
    description: string | null;
    preconditions: string | null;
    finalExpected: string | null;
    priority: string;
    type: string;
    steps: Step[];
  };
};

function applyValues(text: string | null, values: Record<string, string> | undefined) {
  if (!text || !values) return text ?? "";
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

export function ExecutionRow({
  execution,
  projectId,
  runId,
  expand = false,
}: {
  execution: ExecutionForExec;
  projectId: string;
  runId: string;
  expand?: boolean;
}) {
  const [open, setOpen] = useState(expand);
  const [pendingResult, setPendingResult] = useState(execution.result);
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

  function quickRecord(result: string) {
    if (!formRef.current || submittingRef.current) return;
    submittingRef.current = true;
    setPendingResult(result);
    const fd = new FormData(formRef.current);
    fd.set("result", result);
    recordExecution(fd).finally(() => {
      submittingRef.current = false;
    });
  }

  return (
    <div
      className="rounded-md border border-(--border) bg-(--surface)"
      data-testid="execution-row"
      data-execution-id={execution.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-(--muted) hover:text-(--accent)"
            aria-label="toggle details"
            data-testid="execution-toggle"
          >
            {open ? "▾" : "▸"}
          </button>
          <span className="font-mono text-xs text-(--muted)">
            {execution.caseSnapshot.publicId}
          </span>
          <span className="font-medium">{execution.caseSnapshot.title}</span>
          {execution.dataRowLabel ? (
            <Badge tone="info">[{execution.dataRowLabel}]</Badge>
          ) : null}
          <Badge tone="muted">{execution.caseSnapshot.priority}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={resultTone(pendingResult)}>
            {pendingResult.replace("_", " ")}
          </Badge>
          <ResultButton onClick={() => quickRecord("pass")} tone="success">
            Pass
          </ResultButton>
          <ResultButton onClick={() => quickRecord("fail")} tone="danger">
            Fail
          </ResultButton>
          <ResultButton onClick={() => quickRecord("blocked")} tone="warn">
            Block
          </ResultButton>
          <ResultButton onClick={() => quickRecord("skipped")} tone="muted">
            Skip
          </ResultButton>
        </div>
      </div>
      {open ? (
        <div className="space-y-4 border-t border-(--border) px-4 py-3">
          {execution.caseSnapshot.preconditions ? (
            <Section title="Preconditions">
              <p className="whitespace-pre-wrap text-sm">
                {applyValues(execution.caseSnapshot.preconditions, execution.values)}
              </p>
            </Section>
          ) : null}
          <Section title="Steps">
            <ol className="flex flex-col gap-2">
              {execution.caseSnapshot.steps.map((s, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[28px_1fr_1fr] gap-3 rounded-md border border-(--border) bg-(--bg) p-3 text-sm"
                >
                  <div className="text-center font-semibold text-(--muted)">
                    {i + 1}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {applyValues(s.action, execution.values)}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {applyValues(s.expected, execution.values)}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
          {execution.caseSnapshot.finalExpected ? (
            <Section title="Final expected">
              <p className="whitespace-pre-wrap text-sm">
                {applyValues(execution.caseSnapshot.finalExpected, execution.values)}
              </p>
            </Section>
          ) : null}

          <form
            ref={formRef}
            action={recordExecution}
            className="grid grid-cols-1 gap-3 lg:grid-cols-2"
            data-testid="execution-form"
          >
            <input type="hidden" name="id" value={execution.id} />
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="result" value={pendingResult} />
            <Field label="Comments" htmlFor={`comments-${execution.id}`} className="lg:col-span-2">
              <Textarea
                id={`comments-${execution.id}`}
                name="comments"
                defaultValue={execution.comments ?? ""}
                rows={2}
                placeholder="What did you observe? Use markdown for formatting."
              />
            </Field>
            <Field label="Duration (seconds)" htmlFor={`duration-${execution.id}`}>
              <Input
                id={`duration-${execution.id}`}
                name="duration"
                type="number"
                min="0"
                defaultValue={execution.durationSeconds ?? ""}
              />
            </Field>
            <Field label="Linked Jira defects" htmlFor={`jira-${execution.id}`}>
              <Input
                id={`jira-${execution.id}`}
                name="jiraDefectKeys"
                placeholder="PROJ-456"
                defaultValue={execution.jiraDefectKeys ?? ""}
              />
            </Field>
            <Field label="Env override" htmlFor={`env-${execution.id}`}>
              <Input
                id={`env-${execution.id}`}
                name="envOverride"
                defaultValue={execution.envOverride ?? ""}
              />
            </Field>
            <Field label="Build override" htmlFor={`build-${execution.id}`}>
              <Input
                id={`build-${execution.id}`}
                name="buildOverride"
                defaultValue={execution.buildOverride ?? ""}
              />
            </Field>
            <div className="flex items-end justify-end gap-2 lg:col-span-2">
              <Button type="submit" variant="outline" data-testid="execution-save">
                Save details
              </Button>
            </div>
          </form>

          {execution.attempts.length > 0 ? (
            <Section title={`History (${execution.attempts.length} prior attempts)`}>
              <ul className="flex flex-col gap-1 text-xs text-(--muted)">
                {execution.attempts.map((a) => (
                  <li key={a.attemptNum}>
                    #{a.attemptNum} — <Badge tone={resultTone(a.result)}>{a.result}</Badge>{" "}
                    {a.executedAt ? new Date(a.executedAt).toLocaleString() : ""}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultButton({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone: "success" | "danger" | "warn" | "muted";
}) {
  const cls =
    tone === "success"
      ? "border-(--success) text-(--success) hover:bg-(--success-soft)"
      : tone === "danger"
        ? "border-(--danger) text-(--danger) hover:bg-(--danger-soft)"
        : tone === "warn"
          ? "border-(--warn) text-(--warn) hover:bg-(--warn-soft)"
          : "border-(--border) text-(--muted) hover:bg-slate-100";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md border bg-white px-2.5 text-xs font-medium ${cls}`}
      data-testid={`result-${tone === "muted" ? "skip" : tone === "success" ? "pass" : tone === "danger" ? "fail" : "block"}`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
