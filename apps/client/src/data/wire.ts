import type { Activity, Note, NoteAttachmentMeta, Run, Runtime, Task, TaskExecutionMode, TaskStatus, UpdatedBy, WorkspaceSummary } from "../types";

export interface WireTask {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: "human" | "ai";
  target_runtime: Runtime | null;
  execution_mode: TaskExecutionMode;
  ai_urgency: number;
  context_link: string | null;
  input_request: Record<string, unknown> | null;
  input_response: Record<string, unknown> | null;
  active_run_id: string | null;
  check_in_requested_at: string | null;
  check_in_requested_by: UpdatedBy | null;
  created_at: string;
  updated_at: string;
  updated_by: UpdatedBy;
}

export interface WireNote {
  id: string;
  task_id: string;
  author: UpdatedBy;
  kind: "note" | "attachment";
  content: string;
  attachment: Record<string, unknown> | null;
  created_at: string;
}

export interface WireRun {
  id: string;
  task_id: string;
  runtime: Runtime;
  worker_id: string;
  status: "active" | "expired" | "ended";
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  lease_seconds: number;
  end_reason: string | null;
}

export interface WireActivity {
  id: string;
  task_id: string;
  run_id: string | null;
  runtime: Runtime | null;
  actor: UpdatedBy;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface WireWorkspace {
  name: string;
  store?: string | null;
  active?: boolean;
}

export function statusToWire(status: TaskStatus): string {
  return status;
}

export function executionModeToWire(mode: TaskExecutionMode): string {
  return mode;
}

export function toTask(wire: WireTask): Task {
  return {
    id: wire.id,
    title: wire.title,
    status: wire.status,
    assignee: wire.assignee,
    targetRuntime: wire.target_runtime,
    executionMode: wire.execution_mode,
    aiUrgency: wire.ai_urgency,
    contextLink: wire.context_link,
    inputRequest: wire.input_request,
    inputResponse: wire.input_response,
    activeRunId: wire.active_run_id,
    checkInRequestedAt: wire.check_in_requested_at,
    checkInRequestedBy: wire.check_in_requested_by,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
    updatedBy: wire.updated_by,
  };
}

export function toNote(wire: WireNote): Note {
  return {
    id: wire.id,
    taskId: wire.task_id,
    author: wire.author,
    kind: wire.kind,
    content: wire.content,
    attachment: wire.attachment as NoteAttachmentMeta | Record<string, unknown> | null,
    createdAt: wire.created_at,
  };
}

export function toRun(wire: WireRun): Run {
  return {
    id: wire.id,
    taskId: wire.task_id,
    runtime: wire.runtime,
    workerId: wire.worker_id,
    status: wire.status,
    startedAt: wire.started_at,
    lastHeartbeatAt: wire.last_heartbeat_at,
    endedAt: wire.ended_at,
    leaseSeconds: wire.lease_seconds,
    endReason: wire.end_reason,
  };
}

export function toActivity(wire: WireActivity): Activity {
  return {
    id: wire.id,
    taskId: wire.task_id,
    runId: wire.run_id,
    runtime: wire.runtime,
    actor: wire.actor,
    kind: wire.kind,
    summary: wire.summary,
    payload: wire.payload,
    createdAt: wire.created_at,
  };
}

export function toWorkspace(wire: WireWorkspace): WorkspaceSummary {
  return {
    name: wire.name,
    store: wire.store ?? null,
    active: Boolean(wire.active),
  };
}
