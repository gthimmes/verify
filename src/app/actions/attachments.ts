"use server";

import { api, type Attachment } from "@/lib/api";

export type UploadState = { ok: boolean; attachment?: Attachment; message?: string };

const MAX_BYTES = 10 * 1024 * 1024; // mirror the Go cap

/**
 * Receives a File from the client, base64-encodes it, and hands it to the Go
 * API. Returns the new attachment so the caller can update its list without a
 * full-page refresh.
 */
export async function uploadAttachment(formData: FormData): Promise<UploadState> {
  const entityType = String(formData.get("entityType"));
  const entityId = String(formData.get("entityId"));
  const file = formData.get("file");

  if (entityType !== "test_case" && entityType !== "execution") {
    return { ok: false, message: "Invalid attachment target." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File too large (max 10 MB)." };
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const attachment = await api.uploadAttachment({
      entityType,
      entityId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data,
    });
    return { ok: true, attachment };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

// Lazy list for places (execution rows) that shouldn't fetch upfront.
export async function loadAttachments(
  entityType: "test_case" | "execution",
  entityId: string,
): Promise<Attachment[]> {
  try {
    return await api.listAttachments(entityType, entityId);
  } catch {
    return [];
  }
}

export async function deleteAttachment(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api.deleteAttachment(id);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  return { ok: true };
}
