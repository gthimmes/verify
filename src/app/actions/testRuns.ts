"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const RunInput = z.object({
  projectId: z.string(),
  name: z.string().min(2).max(140),
  description: z.string().max(2000).optional().or(z.literal("")),
  environment: z.string().max(60).optional().or(z.literal("")),
  build: z.string().max(80).optional().or(z.literal("")),
  milestone: z.string().max(80).optional().or(z.literal("")),
  plannedStart: z.string().optional().or(z.literal("")),
  plannedEnd: z.string().optional().or(z.literal("")),
  caseIds: z.array(z.string()).min(1),
});

export type RunFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function parseDate(s: unknown) {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function createTestRun(
  _prev: RunFormState,
  formData: FormData,
): Promise<RunFormState> {
  const caseIds = String(formData.get("caseIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = RunInput.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    description: formData.get("description"),
    environment: formData.get("environment"),
    build: formData.get("build"),
    milestone: formData.get("milestone"),
    plannedStart: formData.get("plannedStart"),
    plannedEnd: formData.get("plannedEnd"),
    caseIds,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  const data = parsed.data;
  const user = await requireUser();
  const cases = await prisma.testCase.findMany({
    where: { id: { in: data.caseIds }, projectId: data.projectId, deletedAt: null },
    include: {
      steps: { orderBy: { order: "asc" } },
      parameters: { orderBy: { order: "asc" } },
      dataRows: { orderBy: { order: "asc" } },
    },
  });
  if (cases.length === 0) {
    return { ok: false, message: "No test cases selected." };
  }

  const run = await prisma.$transaction(async (tx) => {
    const r = await tx.testRun.create({
      data: {
        projectId: data.projectId,
        name: data.name.trim(),
        description: data.description?.toString() || null,
        environment: data.environment?.toString() || null,
        build: data.build?.toString() || null,
        milestone: data.milestone?.toString() || null,
        plannedStart: parseDate(data.plannedStart),
        plannedEnd: parseDate(data.plannedEnd),
        ownerId: user.id,
        status: "draft",
      },
    });
    for (const tc of cases) {
      const snapshot = await tx.runSnapshotCase.create({
        data: {
          runId: r.id,
          testCaseId: tc.id,
          publicId: tc.publicId,
          title: tc.title,
          description: tc.description,
          preconditions: tc.preconditions,
          finalExpected: tc.finalExpected,
          type: tc.type,
          priority: tc.priority,
          version: tc.version,
          snapshotJson: JSON.stringify({
            steps: tc.steps.map((s) => ({
              order: s.order,
              action: s.action,
              expected: s.expected,
            })),
            parameters: tc.parameters.map((p) => ({ name: p.name, order: p.order })),
            dataRows: tc.dataRows.map((d) => ({
              order: d.order,
              label: d.label,
              values: JSON.parse(d.valuesJson),
            })),
          }),
        },
      });
      if (tc.dataRows.length === 0) {
        await tx.testExecution.create({
          data: {
            runId: r.id,
            snapshotCaseId: snapshot.id,
            dataRowIndex: null,
            dataRowLabel: null,
            result: "not_run",
          },
        });
      } else {
        for (const row of tc.dataRows) {
          await tx.testExecution.create({
            data: {
              runId: r.id,
              snapshotCaseId: snapshot.id,
              dataRowIndex: row.order,
              dataRowLabel: row.label ?? `Row ${row.order + 1}`,
              result: "not_run",
            },
          });
        }
      }
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "run.create",
        entity: "TestRun",
        entityId: r.id,
        afterJson: JSON.stringify({
          name: data.name,
          caseCount: cases.length,
        }),
      },
    });
    return r;
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/runs`);
  redirect(`/projects/${data.projectId}/runs/${run.id}`);
}

const RunStatuses = ["draft", "in_progress", "completed", "blocked", "aborted"] as const;

export async function setRunStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const status = String(formData.get("status"));
  const reason = String(formData.get("abortReason") || "");
  if (!id || !RunStatuses.includes(status as any)) return;
  const data: any = { status };
  if (status === "in_progress") data.actualStart = new Date();
  if (status === "completed" || status === "aborted") data.actualEnd = new Date();
  if (status === "aborted") data.abortReason = reason || "Aborted";
  await prisma.testRun.update({ where: { id }, data });
  revalidatePath(`/projects/${projectId}/runs`);
  revalidatePath(`/projects/${projectId}/runs/${id}`);
}

export async function reRunFailed(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const user = await requireUser();
  const run = await prisma.testRun.findUnique({
    where: { id },
    include: {
      executions: {
        where: { result: { in: ["fail", "blocked"] } },
        include: {
          snapshotCase: true,
        },
      },
    },
  });
  if (!run) return;
  if (run.executions.length === 0) return;

  // group by snapshotCaseId to know which to add (and which dataRow indices)
  const newRun = await prisma.$transaction(async (tx) => {
    const r = await tx.testRun.create({
      data: {
        projectId,
        parentRunId: id,
        name: `${run.name} — re-run failed`,
        environment: run.environment,
        build: run.build,
        milestone: run.milestone,
        ownerId: user.id,
        status: "draft",
      },
    });
    // dedupe by snapshotCase
    const byCase = new Map<
      string,
      {
        snap: typeof run.executions[number]["snapshotCase"];
        rows: { idx: number | null; label: string | null }[];
      }
    >();
    for (const e of run.executions) {
      const existing = byCase.get(e.snapshotCaseId) ?? {
        snap: e.snapshotCase,
        rows: [],
      };
      existing.rows.push({ idx: e.dataRowIndex, label: e.dataRowLabel });
      byCase.set(e.snapshotCaseId, existing);
    }
    for (const [, group] of byCase) {
      const snap = group.snap;
      const newSnap = await tx.runSnapshotCase.create({
        data: {
          runId: r.id,
          testCaseId: snap.testCaseId,
          publicId: snap.publicId,
          title: snap.title,
          description: snap.description,
          preconditions: snap.preconditions,
          finalExpected: snap.finalExpected,
          type: snap.type,
          priority: snap.priority,
          version: snap.version,
          snapshotJson: snap.snapshotJson,
        },
      });
      for (const row of group.rows) {
        await tx.testExecution.create({
          data: {
            runId: r.id,
            snapshotCaseId: newSnap.id,
            dataRowIndex: row.idx,
            dataRowLabel: row.label,
            result: "not_run",
          },
        });
      }
    }
    return r;
  });
  revalidatePath(`/projects/${projectId}/runs`);
  redirect(`/projects/${projectId}/runs/${newRun.id}`);
}

export async function cloneRun(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const user = await requireUser();
  const run = await prisma.testRun.findUnique({
    where: { id },
    include: { snapshotCases: true },
  });
  if (!run) return;
  const newRun = await prisma.$transaction(async (tx) => {
    const r = await tx.testRun.create({
      data: {
        projectId,
        name: `${run.name} (clone)`,
        environment: run.environment,
        build: run.build,
        milestone: run.milestone,
        description: run.description,
        ownerId: user.id,
        status: "draft",
      },
    });
    for (const snap of run.snapshotCases) {
      const newSnap = await tx.runSnapshotCase.create({
        data: {
          runId: r.id,
          testCaseId: snap.testCaseId,
          publicId: snap.publicId,
          title: snap.title,
          description: snap.description,
          preconditions: snap.preconditions,
          finalExpected: snap.finalExpected,
          type: snap.type,
          priority: snap.priority,
          version: snap.version,
          snapshotJson: snap.snapshotJson,
        },
      });
      const json = JSON.parse(snap.snapshotJson);
      const dataRows: { order: number; label: string | null }[] = json.dataRows ?? [];
      if (dataRows.length === 0) {
        await tx.testExecution.create({
          data: {
            runId: r.id,
            snapshotCaseId: newSnap.id,
            result: "not_run",
          },
        });
      } else {
        for (const row of dataRows) {
          await tx.testExecution.create({
            data: {
              runId: r.id,
              snapshotCaseId: newSnap.id,
              dataRowIndex: row.order,
              dataRowLabel: row.label ?? `Row ${row.order + 1}`,
              result: "not_run",
            },
          });
        }
      }
    }
    return r;
  });
  revalidatePath(`/projects/${projectId}/runs`);
  redirect(`/projects/${projectId}/runs/${newRun.id}`);
}
