import { z } from "zod";

import { attachmentMetaSchema } from "./attachment.js";
import { inputRequestSchema } from "./inputRequest.js";
import { inputResponseSchema } from "./inputResponse.js";
import { isoTimestampSchema } from "./timestamps.js";
import {
  activityRecordSchema,
  actorSchema,
  noteRecordSchema,
  pendingCheckInSchema,
  runRecordSchema,
  runtimeSchema,
  taskExecutionModeSchema,
  taskRecordSchema,
  taskStatusSchema,
} from "./types.js";

export const contextEnvelopeSchema = z.object({
  schema_version: z.literal("2.0"),
  task: taskRecordSchema,
  active_run: runRecordSchema.nullable(),
  context: z
    .object({
      context_link: z.string().nullable(),
      title: z.string().min(1),
      assignee: actorSchema,
      target_runtime: runtimeSchema.nullable(),
      execution_mode: taskExecutionModeSchema,
    })
    .strict(),
  input_request: inputRequestSchema.nullable(),
  input_response: inputResponseSchema.nullable(),
  notes: z.array(noteRecordSchema),
  activity: z.array(activityRecordSchema),
  pending_check_in: pendingCheckInSchema.nullable(),
  artifacts: z.array(
    z
      .object({
        attachment: attachmentMetaSchema,
        note_id: z.string().min(1),
      })
      .strict()
  ),
  constraints: z
    .object({
      status: taskStatusSchema,
      ai_urgency: z.number().int().min(1).max(5),
      execution_mode: taskExecutionModeSchema,
      target_runtime: runtimeSchema.nullable(),
    })
    .strict(),
  timestamps: z
    .object({
      task_updated_at: isoTimestampSchema,
      generated_at: isoTimestampSchema,
    })
    .strict(),
});

export type ContextEnvelope = z.infer<typeof contextEnvelopeSchema>;
