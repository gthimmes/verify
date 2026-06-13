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
    "acceptance",
    "compatibility",
    "other",
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

function asString(v: FormDataEntryValue | null): string {
  return v == null ? "" : String(v);
}

function parse(fd: FormData) {
  const tags = asString(fd.get("tags"))
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    projectId: asString(fd.get("projectId")),
    featureId: asString(fd.get("featureId")),
    title: asString(fd.get("title")),
    description: asString(fd.get("description")),
    preconditions: asString(fd.get("preconditions")),
    finalExpected: asString(fd.get("finalExpected")),
    testDataNotes: asString(fd.get("testDataNotes")),
    type: asString(fd.get("type")) || "functional",
    priority: asString(fd.get("priority")) || "medium",
    status: asString(fd.get("status")) || "active",
    automationStatus: asString(fd.get("automationStatus")) || "not_automated",
    automationFramework: asString(fd.get("automationFramework")),
    automationRef: asString(fd.get("automationRef")),
    automationRepoUrl: asString(fd.get("automationRepoUrl")),
    jiraKeys: asString(fd.get("jiraKeys")),
    tags,
    steps: JSON.parse(asString(fd.get("stepsJson")) || "[]") as {
      action: string;
      expected?: string;
    }[],
    parameters: JSON.parse(asString(fd.get("parametersJson")) || "[]") as {
      name: string;
    }[],
    dataRows: JSON.parse(asString(fd.get("dataRowsJson")) || "[]") as Record<
      string,
      string
    >[],
  };
}

type ParsedBody = z.infer<typeof Body>;

function toApiInput(d: ParsedBody): TestCaseInput {
  const dataRows = d.dataRows.map((row, i) => {
    const { __label, ...values } = row;
    return {
      order: i,
      label: typeof __label === "string" && __label ? __label : null,
      values,
    };
  });
  const steps = d.steps.map((s, i) => ({
    order: i,
    action: s.action,
    expected: s.expected ?? "",
  }));
  const parameters = d.parameters.map((p, i) => ({
    name: p.name,
    order: i,
  }));
  return {
    featureId: d.featureId,
    title: d.title.trim(),
    description: d.description ?? "",
    preconditions: d.preconditions ?? "",
    finalExpected: d.finalExpected ?? "",
    testDataNotes: d.testDataNotes ?? "",
    type: d.type,
    priority: d.priority,
    status: d.status,
    automationStatus: d.automationStatus,
    automationFramework: d.automationFramework ?? "",
    automationRef: d.automationRef ?? "",
    automationRepoUrl: d.automationRepoUrl ?? "",
    jiraKeys: d.jiraKeys ?? "",
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

const BulkBody = z.object({
  projectId: z.string().min(1),
  caseIds: z.array(z.string().min(1)).min(1, "Select at least one case").max(1000),
  op: z.enum(["priority", "status", "automation", "move", "delete", "restore"]),
  value: z.string().optional(),
});

export type BulkActionState = {
  ok: boolean;
  updated?: number;
  message?: string;
};

export async function bulkUpdateCases(
  input: z.input<typeof BulkBody>,
): Promise<BulkActionState> {
  const parsed = BulkBody.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { projectId, caseIds, op, value } = parsed.data;
  let res;
  try {
    res = await api.bulkUpdateCases(projectId, { caseIds, op, value });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
  return { ok: true, updated: res.updated };
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
