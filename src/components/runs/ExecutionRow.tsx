"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, resultTone } from "@/components/ui/Badge";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { recordExecution } from "@/app/actions/executions";
import { LazyAttachments } from "@/components/attachments/Attachments";

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
  stepResults?: { order: number; result: string }[];
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
  const [stepResults, setStepResults] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    (execution.stepResults ?? []).forEach((s) => {
      m[s.order] = s.result;
    });
    return m;
  });
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

  function setStep(order: number, result: "pass" | "fail") {
    setStepResults((prev) => ({
      ...prev,
      [order]: prev[order] === result ? "" : result,
    }));
  }

  const stepResultsJson = JSON.stringify(
    Object.entries(stepResults)
      .filter(([, r]) => r === "pass" || r === "fail")
      .map(([order, result]) => ({ order: Number(order), result })),
  );
  const steps = execution.caseSnapshot.steps;
  const stepPassCount = steps.filter((s) => stepResults[s.order] === "pass").length;
  const stepFailCount = steps.filter((s) => stepResults[s.order] === "fail").length;

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
          <Section
            title={
              steps.length > 0
                ? `Steps — ${stepPassCount} pass, ${stepFailCount} fail of ${steps.length}`
                : "Steps"
            }
          >
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => {
                const sr = stepResults[s.order] ?? "";
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[28px_1fr_1fr_auto] gap-3 rounded-md border border-(--border) bg-(--bg) p-3 text-sm"
                    data-testid="exec-step"
                  >
                    <div className="text-center font-semibold text-(--muted)">{i + 1}</div>
                    <div className="whitespace-pre-wrap">
                      {applyValues(s.action, execution.values)}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {applyValues(s.expected, execution.values)}
                    </div>
                    <div className="flex items-start gap-1">
                      <StepToggle
                        active={sr === "pass"}
                        tone="success"
                        onClick={() => setStep(s.order, "pass")}
                        testid={`step-pass-${i}`}
                      >
                        ✓
                      </StepToggle>
                      <StepToggle
                        active={sr === "fail"}
                        tone="danger"
                        onClick={() => setStep(s.order, "fail")}
                        testid={`step-fail-${i}`}
                      >
                        ✕
                      </StepToggle>
                    </div>
                  </li>
                );
              })}
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
            <input type="hidden" name="stepResultsJson" value={stepResultsJson} />
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

          <Section title="Attachments">
            <LazyAttachments entityType="execution" entityId={execution.id} />
          </Section>
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
          : "border-(--border) text-(--muted) hover:bg-(--border)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md border bg-(--surface) px-2.5 text-xs font-medium ${cls}`}
      data-testid={`result-${tone === "muted" ? "skip" : tone === "success" ? "pass" : tone === "danger" ? "fail" : "block"}`}
    >
      {children}
    </button>
  );
}

function StepToggle({
  active,
  tone,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  tone: "success" | "danger";
  onClick: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  const base = "h-6 w-6 rounded border text-xs font-bold transition-colors";
  const cls = active
    ? tone === "success"
      ? "border-(--success) bg-(--success) text-white"
      : "border-(--danger) bg-(--danger) text-white"
    : tone === "success"
      ? "border-(--border) text-(--success) hover:bg-(--success-soft)"
      : "border-(--border) text-(--danger) hover:bg-(--danger-soft)";
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`} data-testid={testid}>
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
