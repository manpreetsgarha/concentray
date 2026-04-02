export type TaskStatus = "pending" | "in_progress" | "blocked" | "done";
export type TaskExecutionMode = "autonomous" | "session";
export type Runtime = "openclaw" | "claude" | "codex";
export type Actor = "human" | "ai";
export type UpdatedBy = Actor | "system";
export type RunStatus = "active" | "expired" | "ended";
export type NoteKind = "note" | "attachment";

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: Actor;
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

export interface NoteRecord {
  id: string;
  task_id: string;
  author: UpdatedBy;
  kind: NoteKind;
  content: string;
  attachment: Record<string, unknown> | null;
  created_at: string;
}

export interface RunRecord {
  id: string;
  task_id: string;
  runtime: Runtime;
  worker_id: string;
  status: RunStatus;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  lease_seconds: number;
  end_reason: string | null;
}

export interface ActivityRecord {
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
