import { z } from "zod";

import { isoTimestampSchema } from "./timestamps.js";

export const attachmentKindSchema = z.enum(["image", "video", "text", "csv", "file"]);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export const attachmentMetaSchema = z
  .object({
    kind: attachmentKindSchema.optional(),
    filename: z.string().min(1).optional(),
    mime_type: z.string().min(1).optional(),
    size_bytes: z.number().int().nonnegative().optional(),
    sha256: z.string().min(1).optional(),
    uploaded_at: isoTimestampSchema.optional(),
    preview_text: z.string().optional(),
    preview_link: z.string().url().optional(),
    download_link: z.string().url().optional(),
    drive_file_id: z.string().min(1).optional(),
  })
  .strict();

export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;
