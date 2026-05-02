"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const Result = z.enum(["pass", "fail", "blocked", "skipped", "not_run"]);

export async function recordExecution(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const runId = String(formData.get("runId"));
  const result = Result.parse(formData.get("result"));
  const comments = String(formData.get("comments") || "");
  const durationStr = String(formData.get("duration") || "");
  const jiraDefectKeys = String(formData.get("jiraDefectKeys") || "");
  const envOverride = String(formData.get("envOverride") || "");
  const buildOverride = String(formData.get("buildOverride") || "");
  if (!id || !runId) return;

  const user = await requireUser();
  const existing = await prisma.testExecution.findUnique({ where: { id } });
  if (!existing) return;

  // Push previous result into history if it had one
  if (existing.result !== "not_run") {
    const lastAttempt = await prisma.executionAttempt.count({
      where: { executionId: id },
    });
    await prisma.executionAttempt.create({
      data: {
        executionId: id,
        attemptNum: lastAttempt + 1,
        result: existing.result,
        executedById: existing.executedById,
        executedAt: existing.executedAt ?? new Date(),
        comments: existing.comments,
        durationSeconds: existing.durationSeconds,
      },
    });
  }

  const duration = durationStr ? parseInt(durationStr, 10) : null;
  await prisma.testExecution.update({
    where: { id },
    data: {
      result,
      executedById: user.id,
      executedAt: result === "not_run" ? null : new Date(),
      durationSeconds: duration && !isNaN(duration) ? duration : null,
      comments: comments || null,
      jiraDefectKeys: jiraDefectKeys || null,
      envOverride: envOverride || null,
      buildOverride: buildOverride || null,
    },
  });

  // If first non-not_run result for the run, kick run to in_progress
  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (run && run.status === "draft" && result !== "not_run") {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "in_progress", actualStart: new Date() },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "execution.update",
      entity: "TestExecution",
      entityId: id,
      afterJson: JSON.stringify({ result, comments }),
    },
  });

  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  revalidatePath(`/projects/${projectId}/runs/${runId}/execute`);
}
