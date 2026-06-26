"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type MemberActionState = { ok: boolean; message?: string };

const AddSchema = z.object({
  projectId: z.string().min(1),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
});

export async function addMember(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = AddSchema.safeParse({
    projectId: formData.get("projectId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { projectId, email, role } = parsed.data;
  try {
    await api.addMember(projectId, { email, role });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

export async function changeMemberRole(
  projectId: string,
  userId: string,
  role: string,
): Promise<MemberActionState> {
  try {
    await api.updateMemberRole(projectId, userId, role);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

export async function removeMember(
  projectId: string,
  userId: string,
): Promise<MemberActionState> {
  try {
    await api.removeMember(projectId, userId);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}
