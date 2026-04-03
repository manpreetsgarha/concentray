export type {
  Actor,
  AttachmentMeta,
  PendingCheckIn as PendingCheckInRecord,
  InputRequest,
  InputResponse,
  NoteKind,
  RunStatus,
  Runtime,
  TaskExecutionMode,
  TaskStatus,
  UpdatedBy
} from "@concentray/contracts";

import type {
  Actor,
  AttachmentMeta,
  PendingCheckIn as PendingCheckInRecord,
  InputRequest,
  InputResponse,
  NoteKind,
  RunStatus,
  Runtime,
  TaskExecutionMode,
  TaskStatus,
  UpdatedBy,
} from "@concentray/contracts";

export type DetailTab = "notes" | "activity";
export type PendingCheckIn = PendingCheckInRecord | null;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: Actor;
  targetRuntime: Runtime | null;
  executionMode: TaskExecutionMode;
  contextLink: string | null;
  aiUrgency: number;
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

export interface WorkspaceSummary {
  name: string;
  store?: string | null;
  active: boolean;
}
