"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pad } from "@/lib/utils";

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

const TestCaseInput = z.object({
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
  // dataRows: array of objects keyed by parameter name, plus an optional `__label`
  dataRows: z
    .array(z.record(z.string(), z.string()))
    .max(50)
    .default([]),
});

export type TestCaseFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function parseFromFormData(fd: FormData) {
  const tagsRaw = String(fd.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const stepsJson = String(fd.get("stepsJson") ?? "[]");
  const steps = JSON.parse(stepsJson);
  const paramsJson = String(fd.get("parametersJson") ?? "[]");
  const parameters = JSON.parse(paramsJson);
  const dataRowsJson = String(fd.get("dataRowsJson") ?? "[]");
  const dataRows = JSON.parse(dataRowsJson);

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
    steps,
    parameters,
    dataRows,
  };
}

export async function createTestCase(
  _prev: TestCaseFormState,
  formData: FormData,
): Promise<TestCaseFormState> {
  const parsed = TestCaseInput.safeParse(parseFromFormData(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  const data = parsed.data;
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });
  const feature = await prisma.feature.findUnique({
    where: { id: data.featureId },
    include: { area: true },
  });
  if (!project || !feature) return { ok: false, message: "Invalid project/feature." };

  // Compute next sequence number per project
  const last = await prisma.testCase.findFirst({
    where: { projectId: data.projectId },
    orderBy: { sequenceNum: "desc" },
  });
  const seq = (last?.sequenceNum ?? 0) + 1;
  const publicId = `${project.key}-${feature.area.key}-${pad(seq, 4)}`;

  const tagIds: string[] = [];
  for (const tagName of data.tags) {
    const t = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
    tagIds.push(t.id);
  }

  const created = await prisma.$transaction(async (tx) => {
    const tc = await tx.testCase.create({
      data: {
        projectId: data.projectId,
        featureId: data.featureId,
        publicId,
        sequenceNum: seq,
        title: data.title.trim(),
        description: data.description?.toString() || null,
        preconditions: data.preconditions?.toString() || null,
        finalExpected: data.finalExpected?.toString() || null,
        testDataNotes: data.testDataNotes?.toString() || null,
        type: data.type,
        priority: data.priority,
        status: data.status,
        automationStatus: data.automationStatus,
        automationFramework: data.automationFramework?.toString() || null,
        automationRef: data.automationRef?.toString() || null,
        automationRepoUrl: data.automationRepoUrl?.toString() || null,
        jiraKeys: data.jiraKeys?.toString() || null,
        createdById: user.id,
        updatedById: user.id,
        tags: {
          create: tagIds.map((id) => ({ tagId: id })),
        },
        steps: {
          create: data.steps.map((s, i) => ({
            order: i,
            action: s.action,
            expected: s.expected,
          })),
        },
        parameters: {
          create: data.parameters.map((p, i) => ({ name: p.name, order: i })),
        },
        dataRows: {
          create: data.dataRows.map((row, i) => {
            const { __label, ...values } = row;
            return {
              order: i,
              label: typeof __label === "string" && __label ? __label : null,
              valuesJson: JSON.stringify(values),
            };
          }),
        },
      },
    });
    await tx.testCaseVersion.create({
      data: {
        testCaseId: tc.id,
        version: 1,
        snapshotJson: JSON.stringify(data),
        changedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "test_case.create",
        entity: "TestCase",
        entityId: tc.id,
        afterJson: JSON.stringify({ title: data.title, publicId }),
      },
    });
    return tc;
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/cases`);
  redirect(`/projects/${data.projectId}/cases/${created.id}`);
}

export async function updateTestCase(
  _prev: TestCaseFormState,
  formData: FormData,
): Promise<TestCaseFormState> {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, message: "Missing id." };
  const parsed = TestCaseInput.safeParse(parseFromFormData(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  const data = parsed.data;
  const user = await requireUser();
  const existing = await prisma.testCase.findUnique({
    where: { id },
    include: { tags: true, steps: true, parameters: true, dataRows: true },
  });
  if (!existing) return { ok: false, message: "Not found." };

  const tagIds: string[] = [];
  for (const tagName of data.tags) {
    const t = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
    tagIds.push(t.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.testCaseTag.deleteMany({ where: { testCaseId: id } });
    await tx.testStep.deleteMany({ where: { testCaseId: id } });
    await tx.testCaseParam.deleteMany({ where: { testCaseId: id } });
    await tx.testCaseDataRow.deleteMany({ where: { testCaseId: id } });

    const newVersion = existing.version + 1;
    await tx.testCase.update({
      where: { id },
      data: {
        featureId: data.featureId,
        title: data.title.trim(),
        description: data.description?.toString() || null,
        preconditions: data.preconditions?.toString() || null,
        finalExpected: data.finalExpected?.toString() || null,
        testDataNotes: data.testDataNotes?.toString() || null,
        type: data.type,
        priority: data.priority,
        status: data.status,
        automationStatus: data.automationStatus,
        automationFramework: data.automationFramework?.toString() || null,
        automationRef: data.automationRef?.toString() || null,
        automationRepoUrl: data.automationRepoUrl?.toString() || null,
        jiraKeys: data.jiraKeys?.toString() || null,
        updatedById: user.id,
        version: newVersion,
        tags: { create: tagIds.map((tid) => ({ tagId: tid })) },
        steps: {
          create: data.steps.map((s, i) => ({
            order: i,
            action: s.action,
            expected: s.expected,
          })),
        },
        parameters: {
          create: data.parameters.map((p, i) => ({ name: p.name, order: i })),
        },
        dataRows: {
          create: data.dataRows.map((row, i) => {
            const { __label, ...values } = row;
            return {
              order: i,
              label: typeof __label === "string" && __label ? __label : null,
              valuesJson: JSON.stringify(values),
            };
          }),
        },
      },
    });
    await tx.testCaseVersion.create({
      data: {
        testCaseId: id,
        version: newVersion,
        snapshotJson: JSON.stringify(data),
        changedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "test_case.update",
        entity: "TestCase",
        entityId: id,
      },
    });
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/cases`);
  revalidatePath(`/projects/${data.projectId}/cases/${id}`);
  redirect(`/projects/${data.projectId}/cases/${id}`);
}

export async function softDeleteTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  if (!id) return;
  await prisma.testCase.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
}

export async function restoreTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  if (!id) return;
  await prisma.testCase.update({ where: { id }, data: { deletedAt: null } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
}

export async function duplicateTestCase(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const user = await requireUser();
  const original = await prisma.testCase.findUnique({
    where: { id },
    include: {
      feature: { include: { area: true } },
      project: true,
      tags: { include: { tag: true } },
      steps: true,
      parameters: true,
      dataRows: true,
    },
  });
  if (!original) return;
  const last = await prisma.testCase.findFirst({
    where: { projectId: original.projectId },
    orderBy: { sequenceNum: "desc" },
  });
  const seq = (last?.sequenceNum ?? 0) + 1;
  const publicId = `${original.project.key}-${original.feature.area.key}-${pad(seq, 4)}`;

  const dup = await prisma.testCase.create({
    data: {
      projectId: original.projectId,
      featureId: original.featureId,
      publicId,
      sequenceNum: seq,
      title: `${original.title} (copy)`,
      description: original.description,
      preconditions: original.preconditions,
      finalExpected: original.finalExpected,
      testDataNotes: original.testDataNotes,
      type: original.type,
      priority: original.priority,
      status: "draft",
      automationStatus: original.automationStatus,
      automationFramework: original.automationFramework,
      automationRef: original.automationRef,
      automationRepoUrl: original.automationRepoUrl,
      jiraKeys: original.jiraKeys,
      createdById: user.id,
      updatedById: user.id,
      tags: { create: original.tags.map((t) => ({ tagId: t.tagId })) },
      steps: {
        create: original.steps.map((s) => ({
          order: s.order,
          action: s.action,
          expected: s.expected,
        })),
      },
      parameters: {
        create: original.parameters.map((p) => ({ name: p.name, order: p.order })),
      },
      dataRows: {
        create: original.dataRows.map((r) => ({
          order: r.order,
          label: r.label,
          valuesJson: r.valuesJson,
        })),
      },
    },
  });
  revalidatePath(`/projects/${original.projectId}`);
  revalidatePath(`/projects/${original.projectId}/cases`);
  redirect(`/projects/${original.projectId}/cases/${dup.id}`);
}

export async function bulkUpdate(formData: FormData) {
  const idsRaw = String(formData.get("ids") || "");
  const ids = idsRaw.split(",").filter(Boolean);
  const projectId = String(formData.get("projectId") || "");
  const field = String(formData.get("field") || "");
  const value = String(formData.get("value") || "");
  if (ids.length === 0 || !field || !value) return;
  const data: Record<string, string> = {};
  if (
    field === "priority" ||
    field === "status" ||
    field === "automationStatus" ||
    field === "type"
  ) {
    data[field] = value;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.testCase.updateMany({ where: { id: { in: ids } }, data });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/cases`);
}
