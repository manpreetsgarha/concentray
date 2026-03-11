export type TaskStatus = "Pending" | "In Progress" | "Blocked" | "Done";

export type Actor = "Human" | "AI";

export type UpdatedBy = Actor | "System";

export type CommentType = "message" | "log" | "decision" | "attachment";

export interface TaskRecord {
  Task_ID: string;
  Title: string;
  Status: TaskStatus;
  Created_By: Actor;
  Assignee: Actor;
  Context_Link?: string;
  AI_Urgency?: number;
  Input_Request?: string;
  Input_Request_Version?: string;
  Input_Response?: string;
  Created_At: string;
  Updated_At: string;
  Updated_By: UpdatedBy;
  Version: number;
  Field_Clock: string;
  Deleted_At?: string;
}

export interface CommentRecord {
  Comment_ID: string;
  Task_ID: string;
  Author: Actor;
  Timestamp: string;
  Message: string;
  Type: CommentType;
  Attachment_Link?: string;
  Metadata?: Record<string, unknown> | null;
  Created_At: string;
  Updated_At: string;
  Version: number;
  Deleted_At?: string;
}
