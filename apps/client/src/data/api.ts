import { attachmentMetaSchema } from "@concentray/contracts";
import { z } from "zod";

import type { AttachmentMeta } from "../types";
import type { UploadDraft } from "../lib/uploads";

const uploadedFileSchema = attachmentMetaSchema.extend({
  task_id: z.string().min(1),
});

export async function uploadTaskFile(
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>,
  taskId: string,
  draft: UploadDraft
): Promise<AttachmentMeta> {
  const payload = await apiRequest("/files", {
    method: "POST",
    body: JSON.stringify({
      task_id: taskId,
      filename: draft.filename,
      mime_type: draft.mime_type,
      size_bytes: draft.size_bytes,
      data_base64: draft.data_base64,
    }),
  });

  const parsed = uploadedFileSchema.parse(payload.file);
  return {
    kind: parsed.kind,
    filename: parsed.filename,
    mime_type: parsed.mime_type,
    size_bytes: parsed.size_bytes,
    sha256: parsed.sha256,
    uploaded_at: parsed.uploaded_at,
    preview_text: parsed.preview_text,
    preview_link: parsed.preview_link,
    download_link: parsed.download_link,
    drive_file_id: parsed.drive_file_id,
  };
}
