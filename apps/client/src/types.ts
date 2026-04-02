export type {
  Actor,
  InputRequest,
  NoteKind,
  RunStatus,
  Runtime,
  TaskExecutionMode,
  TaskStatus,
  UpdatedBy
} from "@concentray/contracts";

import type {
  Actor,
  InputRequest,
  NoteKind,
  RunStatus,
  Runtime,
  TaskExecutionMode,
  TaskStatus,
  UpdatedBy,
} from "@concentray/contracts";

export interface NoteAttachmentMeta {
  kind?: "image" | "video" | "text" | "csv" | "file";
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
  uploaded_at?: string;
  preview_text?: string;
  preview_link?: string;
  download_link?: string;
  drive_file_id?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: Actor;
  targetRuntime: Runtime | null;
  executionMode: TaskExecutionMode;
  contextLink: string | null;
  aiUrgency: number;
  inputRequest: InputRequest | Record<string, unknown> | null;
  inputResponse: Record<string, unknown> | null;
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
  attachment: NoteAttachmentMeta | Record<string, unknown> | null;
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
