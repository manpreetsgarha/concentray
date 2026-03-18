import type { Actor, TaskExecutionMode, TaskStatus } from "@concentray/contracts";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdBy: Actor;
  assignee: Actor;
  executionMode: TaskExecutionMode;
  contextLink?: string;
  aiUrgency?: number;
  inputRequest?: Record<string, unknown> | null;
  inputRequestVersion?: string | null;
  inputResponse?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: Actor | "System";
  version: number;
  fieldClock: Record<string, string>;
  deletedAt?: string | null;
}

export interface Comment {
  id: string;
  taskId: string;
  author: Actor;
  timestamp: string;
  message: string;
  type: "message" | "log" | "decision" | "attachment";
  attachmentLink?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt?: string | null;
}

export interface PendingOp {
  opId: string;
  type: "task.create" | "task.patch" | "comment.create";
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

export interface SyncDelta {
  cursor: string;
  tasks: Task[];
  comments: Comment[];
}

export interface PushResult {
  ackedOpIds: string[];
  rejectedOpIds: string[];
}

export interface SyncTransport {
  pull(cursor?: string): Promise<SyncDelta>;
  push(ops: PendingOp[]): Promise<PushResult>;
}
