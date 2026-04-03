import {
  activityRecordSchema,
  type ActivityRecord,
  noteRecordSchema,
  type NoteRecord,
  pendingCheckInSchema,
  runRecordSchema,
  type RunRecord,
  taskRecordSchema,
  type TaskRecord,
} from "@concentray/contracts";
import { z } from "zod";

import type {
  Activity,
  Note,
  PendingCheckIn,
  Run,
  Task,
  TaskExecutionMode,
  TaskStatus,
  WorkspaceSummary,
} from "../types";

export type WireTask = TaskRecord;
export type WireNote = NoteRecord;
export type WireRun = RunRecord;
export type WireActivity = ActivityRecord;

export interface WireWorkspace {
  name: string;
  store?: string | null;
  active?: boolean;
}

const workspaceSchema = z
  .object({
    name: z.string().min(1),
    store: z.string().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export function statusToWire(status: TaskStatus): string {
  return status;
}

export function executionModeToWire(mode: TaskExecutionMode): string {
  return mode;
}

export function toTask(wire: WireTask): Task {
  const parsed = taskRecordSchema.parse(wire);
  return {
    id: parsed.id,
    title: parsed.title,
    status: parsed.status,
    assignee: parsed.assignee,
    targetRuntime: parsed.target_runtime,
    executionMode: parsed.execution_mode,
    aiUrgency: parsed.ai_urgency,
    contextLink: parsed.context_link,
    inputRequest: parsed.input_request,
    inputResponse: parsed.input_response,
    activeRunId: parsed.active_run_id,
    checkInRequestedAt: parsed.check_in_requested_at,
    checkInRequestedBy: parsed.check_in_requested_by,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    updatedBy: parsed.updated_by,
  };
}

export function toNote(wire: WireNote): Note {
  const parsed = noteRecordSchema.parse(wire);
  return {
    id: parsed.id,
    taskId: parsed.task_id,
    author: parsed.author,
    kind: parsed.kind,
    content: parsed.content,
    attachment: parsed.attachment,
    createdAt: parsed.created_at,
  };
}

export function toRun(wire: WireRun): Run {
  const parsed = runRecordSchema.parse(wire);
  return {
    id: parsed.id,
    taskId: parsed.task_id,
    runtime: parsed.runtime,
    workerId: parsed.worker_id,
    status: parsed.status,
    startedAt: parsed.started_at,
    lastHeartbeatAt: parsed.last_heartbeat_at,
    endedAt: parsed.ended_at,
    leaseSeconds: parsed.lease_seconds,
    endReason: parsed.end_reason,
  };
}

export function toActivity(wire: WireActivity): Activity {
  const parsed = activityRecordSchema.parse(wire);
  return {
    id: parsed.id,
    taskId: parsed.task_id,
    runId: parsed.run_id,
    runtime: parsed.runtime,
    actor: parsed.actor,
    kind: parsed.kind,
    summary: parsed.summary,
    payload: parsed.payload,
    createdAt: parsed.created_at,
  };
}

export function toPendingCheckIn(wire: unknown): PendingCheckIn | null {
  if (wire == null) {
    return null;
  }
  return pendingCheckInSchema.parse(wire);
}

export function toWorkspace(wire: WireWorkspace): WorkspaceSummary {
  const parsed = workspaceSchema.parse(wire);
  return {
    name: parsed.name,
    store: parsed.store ?? null,
    active: Boolean(parsed.active),
  };
}
