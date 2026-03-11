import { z } from "zod";

export const inputRequestBaseSchema = z.object({
  schema_version: z.literal("1.0"),
  request_id: z.string().min(1),
  type: z.enum(["choice", "approve_reject", "text_input", "file_or_photo"]),
  prompt: z.string().min(1),
  required: z.boolean(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional()
});

export const choiceInputRequestSchema = inputRequestBaseSchema.extend({
  type: z.literal("choice"),
  options: z.array(z.string().min(1)).min(1),
  allow_multiple: z.boolean().default(false)
});

export const approveRejectInputRequestSchema = inputRequestBaseSchema.extend({
  type: z.literal("approve_reject"),
  approve_label: z.string().min(1),
  reject_label: z.string().min(1)
});

export const textInputRequestSchema = inputRequestBaseSchema.extend({
  type: z.literal("text_input"),
  placeholder: z.string().optional(),
  multiline: z.boolean().default(false),
  max_length: z.number().int().positive().optional()
});

export const fileOrPhotoInputRequestSchema = inputRequestBaseSchema.extend({
  type: z.literal("file_or_photo"),
  accept: z.array(z.enum(["image/*", "application/pdf", "text/plain"]))
    .min(1)
    .default(["image/*"]),
  max_files: z.number().int().positive().default(1),
  max_size_mb: z.number().positive().default(10),
  capture: z.boolean().default(false)
});

export const inputRequestSchema = z.discriminatedUnion("type", [
  choiceInputRequestSchema,
  approveRejectInputRequestSchema,
  textInputRequestSchema,
  fileOrPhotoInputRequestSchema
]);

export type InputRequest = z.infer<typeof inputRequestSchema>;
