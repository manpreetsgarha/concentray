export type {
  Actor,
  CommentType,
  InputRequest,
  TaskExecutionMode,
  TaskStatus
} from "@concentray/contracts";

import type { Actor, CommentType, InputRequest, TaskExecutionMode, TaskStatus } from "@concentray/contracts";

export interface CommentAttachmentMeta {
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
  createdBy: Actor;
  assignee: Actor;
  executionMode: TaskExecutionMode;
  contextLink?: string;
  aiUrgency?: number;
  inputRequest?: InputRequest | null;
  inputResponse?: Record<string, unknown> | null;
  workerId?: string;
  claimedAt?: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  author: Actor;
  message: string;
  type: CommentType;
  timestamp: string;
  attachmentLink?: string;
  metadata?: Record<string, unknown> | null;
  attachmentMeta?: CommentAttachmentMeta;
}

export interface WorkspaceSummary {
  name: string;
  provider?: string;
  store?: string;
  active: boolean;
}
