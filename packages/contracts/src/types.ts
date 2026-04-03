import { z } from "zod";

import { attachmentMetaSchema } from "./attachment.js";
import { inputRequestSchema } from "./inputRequest.js";
import { inputResponseSchema } from "./inputResponse.js";
import { isoTimestampSchema } from "./timestamps.js";

export const taskStatusSchema = z.enum(["pending", "in_progress", "blocked", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskExecutionModeSchema = z.enum(["autonomous", "session"]);
export type TaskExecutionMode = z.infer<typeof taskExecutionModeSchema>;

export const runtimeSchema = z.enum(["openclaw", "claude", "codex"]);
export type Runtime = z.infer<typeof runtimeSchema>;

export const actorSchema = z.enum(["human", "ai"]);
export type Actor = z.infer<typeof actorSchema>;

export const updatedBySchema = z.enum(["human", "ai", "system"]);
export type UpdatedBy = z.infer<typeof updatedBySchema>;

export const runStatusSchema = z.enum(["active", "expired", "ended"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const noteKindSchema = z.enum(["note", "attachment"]);
export type NoteKind = z.infer<typeof noteKindSchema>;

export const pendingCheckInSchema = z
  .object({
    requested_at: isoTimestampSchema,
    requested_by: updatedBySchema,
  })
  .strict();

export type PendingCheckIn = z.infer<typeof pendingCheckInSchema>;

export const taskRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: taskStatusSchema,
    assignee: actorSchema,
    target_runtime: runtimeSchema.nullable(),
    execution_mode: taskExecutionModeSchema,
    ai_urgency: z.number().int().min(1).max(5),
    context_link: z.string().nullable(),
    input_request: inputRequestSchema.nullable(),
    input_response: inputResponseSchema.nullable(),
    active_run_id: z.string().nullable(),
    check_in_requested_at: isoTimestampSchema.nullable(),
    check_in_requested_by: updatedBySchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
    updated_by: updatedBySchema,
  })
  .strict();

export type TaskRecord = z.infer<typeof taskRecordSchema>;

export const noteRecordSchema = z
  .object({
    id: z.string().min(1),
    task_id: z.string().min(1),
    author: updatedBySchema,
    kind: noteKindSchema,
    content: z.string(),
    attachment: attachmentMetaSchema.nullable(),
    created_at: isoTimestampSchema,
  })
  .strict();

export type NoteRecord = z.infer<typeof noteRecordSchema>;

export const runRecordSchema = z
  .object({
    id: z.string().min(1),
    task_id: z.string().min(1),
    runtime: runtimeSchema,
    worker_id: z.string().min(1),
    status: runStatusSchema,
    started_at: isoTimestampSchema,
    last_heartbeat_at: isoTimestampSchema,
    ended_at: isoTimestampSchema.nullable(),
    lease_seconds: z.number().int().positive(),
    end_reason: z.string().nullable(),
  })
  .strict();

export type RunRecord = z.infer<typeof runRecordSchema>;

export const activityRecordSchema = z
  .object({
    id: z.string().min(1),
    task_id: z.string().min(1),
    run_id: z.string().nullable(),
    runtime: runtimeSchema.nullable(),
    actor: updatedBySchema,
    kind: z.string().min(1),
    summary: z.string().min(1),
    payload: z.record(z.unknown()).nullable(),
    created_at: isoTimestampSchema,
  })
  .strict();

export type ActivityRecord = z.infer<typeof activityRecordSchema>;
