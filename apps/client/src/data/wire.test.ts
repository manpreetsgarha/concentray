import { describe, expect, it } from "vitest";

import { executionModeToWire, statusToWire, toComment, toTask, toWorkspace } from "./wire";

describe("wire adapters", () => {
  it("maps task payloads into client models", () => {
    const task = toTask({
      Task_ID: "task-1",
      Title: "Ship quality gates",
      Status: "In Progress",
      Created_By: "Human",
      Assignee: "AI",
      Execution_Mode: "autonomous",
      Context_Link: "https://example.com/brief",
      AI_Urgency: 5,
      Input_Request: {
        schema_version: "1.0",
        request_id: "req-1",
        type: "choice",
        prompt: "Pick a branch",
        required: true,
        created_at: "2026-03-01T10:00:00Z",
        options: ["main", "staging"],
      },
      Input_Response: null,
      Worker_ID: "codex-main",
      Claimed_At: "2026-03-01T10:05:00Z",
      Updated_At: "2026-03-01T10:05:00Z",
    });

    expect(task).toMatchObject({
      id: "task-1",
      status: "In Progress",
      createdBy: "Human",
      assignee: "AI",
      executionMode: "Autonomous",
      workerId: "codex-main",
      claimedAt: "2026-03-01T10:05:00Z",
    });
  });

  it("maps comment attachments and workspace payloads", () => {
    const comment = toComment({
      Comment_ID: "c-1",
      Task_ID: "task-1",
      Author: "AI",
      Message: "Attached build output",
      Type: "attachment",
      Timestamp: "2026-03-01T10:06:00Z",
      Attachment_Link: "https://example.com/file.txt",
      Metadata: {
        filename: "file.txt",
        mime_type: "text/plain",
        size_bytes: 24,
        preview_text: "hello",
      },
    });
    const workspace = toWorkspace({
      name: "default",
      provider: "local_json",
      store: ".data/store.json",
      active: true,
    });

    expect(comment.attachmentMeta?.filename).toBe("file.txt");
    expect(workspace).toEqual({
      name: "default",
      provider: "local_json",
      store: ".data/store.json",
      active: true,
    });
  });

  it("keeps outbound wire values normalized", () => {
    expect(statusToWire("In Progress")).toBe("in_progress");
    expect(statusToWire("Done")).toBe("done");
    expect(executionModeToWire("Session")).toBe("session");
  });
});
