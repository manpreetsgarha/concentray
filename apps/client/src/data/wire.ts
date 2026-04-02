import type { Actor, Comment, CommentAttachmentMeta, Task, TaskExecutionMode, TaskStatus, WorkspaceSummary } from "../types";

export interface WireTask {
  Task_ID: string;
  Title: string;
  Status: string;
  Created_By: string;
  Assignee: string;
  Execution_Mode?: string | null;
  Context_Link?: string | null;
  AI_Urgency?: number;
  Input_Request?: Record<string, unknown> | null;
  Input_Response?: Record<string, unknown> | null;
  Worker_ID?: string | null;
  Claimed_At?: string | null;
  Updated_At?: string;
}

export interface WireComment {
  Comment_ID: string;
  Task_ID: string;
  Author: string;
  Message: string;
  Type: string;
  Timestamp: string;
  Attachment_Link?: string | null;
  Metadata?: Record<string, unknown> | null;
}

export interface WireWorkspace {
  name: string;
  provider?: string;
  store?: string;
  active?: boolean;
}

function normalizeStatus(raw: string): TaskStatus {
  if (raw === "In Progress") {
    return "In Progress";
  }
  if (raw === "Blocked") {
    return "Blocked";
  }
  if (raw === "Done") {
    return "Done";
  }
  return "Pending";
}

function normalizeActor(raw: string): Actor {
  return raw.toLowerCase() === "ai" ? "AI" : "Human";
}

function normalizeExecutionMode(raw: string | null | undefined, assignee: Actor): TaskExecutionMode {
  if ((raw ?? "").toLowerCase() === "session") {
    return "Session";
  }
  if ((raw ?? "").toLowerCase() === "autonomous") {
    return "Autonomous";
  }
  return assignee === "Human" ? "Session" : "Autonomous";
}

export function statusToWire(status: TaskStatus): string {
  if (status === "In Progress") {
    return "in_progress";
  }
  return status.toLowerCase();
}

export function executionModeToWire(mode: TaskExecutionMode): string {
  return mode.toLowerCase();
}

export function toTask(wire: WireTask): Task {
  const assignee = normalizeActor(wire.Assignee);
  return {
    id: wire.Task_ID,
    title: wire.Title,
    status: normalizeStatus(wire.Status),
    createdBy: normalizeActor(wire.Created_By),
    assignee,
    executionMode: normalizeExecutionMode(wire.Execution_Mode, assignee),
    contextLink: wire.Context_Link ?? undefined,
    aiUrgency: wire.AI_Urgency,
    inputRequest: (wire.Input_Request as Task["inputRequest"]) ?? null,
    inputResponse: wire.Input_Response ?? null,
    workerId: wire.Worker_ID ?? undefined,
    claimedAt: wire.Claimed_At ?? undefined,
    updatedAt: wire.Updated_At ?? new Date().toISOString()
  };
}

export function toComment(wire: WireComment): Comment {
  const typeMapping: Record<string, Comment["type"]> = {
    message: "message",
    log: "log",
    decision: "decision",
    attachment: "attachment"
  };

  const rawType = wire.Type.toLowerCase();
  const metadata = wire.Metadata ?? null;
  const attachmentMeta =
    rawType === "attachment" || Boolean(wire.Attachment_Link)
      ? ((metadata as CommentAttachmentMeta | null) ?? undefined)
      : undefined;

  return {
    id: wire.Comment_ID,
    taskId: wire.Task_ID,
    author: normalizeActor(wire.Author),
    message: wire.Message,
    type: typeMapping[rawType] ?? "message",
    timestamp: wire.Timestamp,
    attachmentLink: wire.Attachment_Link ?? undefined,
    metadata,
    attachmentMeta
  };
}

export function toWorkspace(wire: WireWorkspace): WorkspaceSummary {
  return {
    name: wire.name,
    provider: wire.provider,
    store: wire.store,
    active: Boolean(wire.active)
  };
}
