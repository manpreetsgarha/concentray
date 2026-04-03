import type { UploadDraft } from "./uploads";

export type BlockerSubmission =
  | { type: "choice"; selections: string[] }
  | { type: "approve_reject"; approved: boolean }
  | { type: "text_input"; value: string }
  | { type: "file_or_photo"; files: UploadDraft[] };
