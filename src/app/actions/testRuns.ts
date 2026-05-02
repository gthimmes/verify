"use server";

import { z } from "zod";
import { api } from "@/lib/api";
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
  let run;
  try {
    run = await api.createRun(parsed.data.projectId, {
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? undefined,
      environment: parsed.data.environment ?? undefined,
      build: parsed.data.build ?? undefined,
      milestone: parsed.data.milestone ?? undefined,
      plannedStart: parsed.data.plannedStart ?? undefined,
      plannedEnd: parsed.data.plannedEnd ?? undefined,
      caseIds: parsed.data.caseIds,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/runs`);
  redirect(`/projects/${parsed.data.projectId}/runs/${run.id}`);
}

export async function setRunStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const status = String(formData.get("status"));
  const reason = String(formData.get("abortReason") || "");
  if (!id || !status) return;
  await api.setRunStatus(id, status, reason || undefined);
  revalidatePath(`/projects/${projectId}/runs`);
  revalidatePath(`/projects/${projectId}/runs/${id}`);
}

export async function reRunFailed(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  let run;
  try {
    run = await api.reRunFailed(id);
  } catch {
    return;
  }
  revalidatePath(`/projects/${projectId}/runs`);
  redirect(`/projects/${projectId}/runs/${run.id}`);
}

export async function cloneRun(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  let run;
  try {
    run = await api.cloneRun(id);
  } catch {
    return;
  }
  revalidatePath(`/projects/${projectId}/runs`);
  redirect(`/projects/${projectId}/runs/${run.id}`);
}
