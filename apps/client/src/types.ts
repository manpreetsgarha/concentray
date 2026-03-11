export type Actor = "Human" | "AI";
export type TaskStatus = "Pending" | "In Progress" | "Blocked" | "Done";

export type InputRequestType = "choice" | "approve_reject" | "text_input" | "file_or_photo";

export interface InputRequestBase {
  schema_version: "1.0";
  request_id: string;
  type: InputRequestType;
  prompt: string;
  required: boolean;
  created_at: string;
  expires_at?: string;
}

export interface ChoiceInputRequest extends InputRequestBase {
  type: "choice";
  options: string[];
  allow_multiple?: boolean;
}

export interface ApproveRejectInputRequest extends InputRequestBase {
  type: "approve_reject";
  approve_label: string;
  reject_label: string;
}

export interface TextInputRequest extends InputRequestBase {
  type: "text_input";
  placeholder?: string;
  multiline?: boolean;
  max_length?: number;
}

export interface FileOrPhotoInputRequest extends InputRequestBase {
  type: "file_or_photo";
  accept: string[];
  max_files?: number;
  max_size_mb?: number;
  capture?: boolean;
}

export type InputRequest =
  | ChoiceInputRequest
  | ApproveRejectInputRequest
  | TextInputRequest
  | FileOrPhotoInputRequest;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdBy: Actor;
  assignee: Actor;
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
  type: "message" | "log" | "decision" | "attachment";
  timestamp: string;
  attachmentLink?: string;
  metadata?: Record<string, unknown> | null;
  attachmentMeta?: {
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
  };
}

export interface WorkspaceSummary {
  name: string;
  provider?: string;
  store?: string;
  active: boolean;
}
