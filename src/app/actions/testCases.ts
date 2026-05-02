"use server";

import { z } from "zod";
import { api, type TestCaseInput } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const StepInput = z.object({
  action: z.string().min(1).max(2000),
  expected: z.string().max(2000).default(""),
});

const ParamColumn = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letters/digits/underscore"),
});

const Body = z.object({
  projectId: z.string(),
  featureId: z.string(),
  title: z.string().min(2).max(240),
  description: z.string().max(4000).optional().or(z.literal("")),
  preconditions: z.string().max(4000).optional().or(z.literal("")),
  finalExpected: z.string().max(2000).optional().or(z.literal("")),
  testDataNotes: z.string().max(2000).optional().or(z.literal("")),
  type: z.enum([
    "functional",
    "regression",
    "smoke",
    "integration",
    "exploratory",
    "performance",
    "security",
    "accessibility",
  ]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["draft", "active", "deprecated"]),
  automationStatus: z.enum(["not_automated", "partial", "full"]),
  automationFramework: z.string().max(60).optional().or(z.literal("")),
  automationRef: z.string().max(500).optional().or(z.literal("")),
  automationRepoUrl: z.string().max(500).optional().or(z.literal("")),
  jiraKeys: z.string().max(500).optional().or(z.literal("")),
  tags: z.array(z.string().max(40)).default([]),
  steps: z.array(StepInput).max(50).default([]),
  parameters: z.array(ParamColumn).max(15).default([]),
  dataRows: z.array(z.record(z.string(), z.string())).max(50).default([]),
});

export type TestCaseFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function parse(fd: FormData) {
  const tagsRaw = String(fd.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    projectId: String(fd.get("projectId") ?? ""),
    featureId: String(fd.get("featureId") ?? ""),
    title: String(fd.get("title") ?? ""),
    description: fd.get("description") ?? "",
    preconditions: fd.get("preconditions") ?? "",
    finalExpected: fd.get("finalExpected") ?? "",
    testDataNotes: fd.get("testDataNotes") ?? "",
    type: String(fd.get("type") ?? "functional"),
    priority: String(fd.get("priority") ?? "medium"),
    status: String(fd.get("status") ?? "active"),
    automationStatus: String(fd.get("automationStatus") ?? "not_automated"),
    automationFramework: fd.get("automationFramework") ?? "",
    automationRef: fd.get("automationRef") ?? "",
    automationRepoUrl: fd.get("automationRepoUrl") ?? "",
    jiraKeys: fd.get("jiraKeys") ?? "",
    tags,
    steps: JSON.parse(String(fd.get("stepsJson") ?? "[]")),
    parameters: JSON.parse(String(fd.get("parametersJson") ?? "[]")),
    dataRows: JSON.parse(String(fd.get("dataRowsJson") ?? "[]")),
  };
}

function toApiInput(d: ReturnType<typeof parse>): TestCaseInput {
  const dataRows = (d.dataRows as Record<string, string>[]).map((row, i) => {
    const { __label, ...values } = row;
    return {
      order: i,
      label: typeof __label === "string" && __label ? __label : null,
      values,
    };
  });
  const steps = (d.steps as { action: string; expected: string }[]).map((s, i) => ({
    order: i,
    action: s.action,
    expected: s.expected ?? "",
  }));
  const parameters = (d.parameters as { name: string }[]).map((p, i) => ({
    name: p.name,
    order: i,
  }));
  return {
    featureId: d.featureId,
    title: String(d.title).trim(),
    description: String(d.description ?? ""),
    preconditions: String(d.preconditions ?? ""),
    finalExpected: String(d.finalExpected ?? ""),
    testDataNotes: String(d.testDataNotes ?? ""),
    type: d.type as string,
    priority: d.priority as string,
    status: d.status as string,
    automationStatus: d.automationStatus as string,
    automationFramework: String(d.automationFramework ?? ""),
    automationRef: String(d.automationRef ?? ""),
    automationRepoUrl: String(d.automationRepoUrl ?? ""),
    jiraKeys: String(d.jiraKeys ?? ""),
    tags: d.tags,
    steps,
    parameters,
    dataRows,
  };
}

export async function createTestCase(
  _prev: TestCaseFormState,
  formData: FormData,
): Promise<TestCaseFormState> {
  const parsed = Body.safeParse(parse(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  let created;
  try {
    created = await api.createCase(parsed.data.projectId, toApiInput(parsed.data));
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/cases`);
  redirect(`/projects/${parsed.data.projectId}/cases/${created.id}`);
}

export async function updateTestCase(
  _prev: TestCaseFormState,
  formData: FormData,
): Promise<TestCaseFormState> {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, message: "Missing id." };
  const parsed = Body.safeParse(parse(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  try {
    await api.updateCase(id, toApiInput(parsed.data));
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/cases`);
  revalidatePath(`/projects/${parsed.data.projectId}/cases/${id}`);
  redirect(`/projects/${parsed.data.projectId}/cases/${id}`);
}

export async function softDeleteTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  if (!id) return;
  await api.deleteCase(id);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
}

export async function restoreTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  if (!id) return;
  await api.restoreCase(id);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
}

export async function duplicateTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  let dup;
  try {
    dup = await api.duplicateCase(id);
  } catch {
    return;
  }
  revalidatePath(`/projects/${dup.projectId}`);
  revalidatePath(`/projects/${dup.projectId}/cases`);
  redirect(`/projects/${dup.projectId}/cases/${dup.id}`);
}
