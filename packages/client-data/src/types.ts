import type {
  ActivityRecord,
  AttachmentMeta,
  InputRequest,
  InputResponse,
  NoteKind,
  Runtime,
  RunRecord,
  RunStatus,
  TaskExecutionMode,
  TaskRecord,
  TaskStatus,
  UpdatedBy,
} from "@concentray/contracts";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: "human" | "ai";
  executionMode: TaskExecutionMode;
  targetRuntime: Runtime | null;
  aiUrgency: number;
  contextLink: string | null;
  inputRequest: InputRequest | null;
  inputResponse: InputResponse | null;
  activeRunId: string | null;
  checkInRequestedAt: string | null;
  checkInRequestedBy: UpdatedBy | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: UpdatedBy;
}

export interface Note {
  id: string;
  taskId: string;
  author: UpdatedBy;
  kind: NoteKind;
  content: string;
  attachment: AttachmentMeta | null;
  createdAt: string;
}

export interface Run {
  id: string;
  taskId: string;
  runtime: Runtime;
  workerId: string;
  status: RunStatus;
  startedAt: string;
  lastHeartbeatAt: string;
  endedAt: string | null;
  leaseSeconds: number;
  endReason: string | null;
}

export interface Activity {
  id: string;
  taskId: string;
  runId: string | null;
  runtime: Runtime | null;
  actor: UpdatedBy;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface PendingOp {
  opId: string;
  type: "task.create" | "task.patch" | "note.create" | "run.upsert" | "activity.create";
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

export interface SyncDelta {
  cursor: string;
  tasks: Task[];
  notes: Note[];
  runs: Run[];
  activity: Activity[];
}

export interface PushResult {
  ackedOpIds: string[];
  rejectedOpIds: string[];
}

export interface SyncTransport {
  pull(cursor?: string): Promise<SyncDelta>;
  push(ops: PendingOp[]): Promise<PushResult>;
}

export function fromTaskRecord(record: TaskRecord): Task {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    assignee: record.assignee,
    executionMode: record.execution_mode,
    targetRuntime: record.target_runtime,
    aiUrgency: record.ai_urgency,
    contextLink: record.context_link,
    inputRequest: record.input_request,
    inputResponse: record.input_response,
    activeRunId: record.active_run_id,
    checkInRequestedAt: record.check_in_requested_at,
    checkInRequestedBy: record.check_in_requested_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
  };
}

export function fromRunRecord(record: RunRecord): Run {
  return {
    id: record.id,
    taskId: record.task_id,
    runtime: record.runtime,
    workerId: record.worker_id,
    status: record.status,
    startedAt: record.started_at,
    lastHeartbeatAt: record.last_heartbeat_at,
    endedAt: record.ended_at,
    leaseSeconds: record.lease_seconds,
    endReason: record.end_reason,
  };
}

export function fromActivityRecord(record: ActivityRecord): Activity {
  return {
    id: record.id,
    taskId: record.task_id,
    runId: record.run_id,
    runtime: record.runtime,
    actor: record.actor,
    kind: record.kind,
    summary: record.summary,
    payload: record.payload,
    createdAt: record.created_at,
  };
}
