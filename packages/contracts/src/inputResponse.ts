import { z } from "zod";

import { attachmentMetaSchema } from "./attachment.js";

export const choiceInputResponseSchema = z
  .object({
    type: z.literal("choice"),
    selections: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const approveRejectInputResponseSchema = z
  .object({
    type: z.literal("approve_reject"),
    approved: z.boolean(),
  })
  .strict();

export const textInputResponseSchema = z
  .object({
    type: z.literal("text_input"),
    value: z.string().min(1),
  })
  .strict();

export const fileOrPhotoInputResponseSchema = z
  .object({
    type: z.literal("file_or_photo"),
    files: z.array(attachmentMetaSchema).min(1),
  })
  .strict();

export const inputResponseSchema = z.discriminatedUnion("type", [
  choiceInputResponseSchema,
  approveRejectInputResponseSchema,
  textInputResponseSchema,
  fileOrPhotoInputResponseSchema,
]);

export type InputResponse = z.infer<typeof inputResponseSchema>;
