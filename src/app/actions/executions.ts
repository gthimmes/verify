"use server";

import { z } from "zod";
import { api } from "@/lib/api";
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
  const dur = durationStr ? Number(durationStr) : null;
  await api.recordExecution(id, {
    result,
    comments,
    durationSeconds: Number.isFinite(dur as number) ? (dur as number) : null,
    jiraDefectKeys,
    envOverride,
    buildOverride,
  });
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  revalidatePath(`/projects/${projectId}/runs/${runId}/execute`);
}
