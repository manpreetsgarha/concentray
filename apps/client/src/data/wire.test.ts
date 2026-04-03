import { describe, expect, it } from "vitest";

import {
  executionModeToWire,
  statusToWire,
  toActivity,
  toNote,
  toPendingCheckIn,
  toRun,
  toTask,
  toWorkspace,
} from "./wire";

describe("wire adapters", () => {
  it("maps task payloads into client models", () => {
    const task = toTask({
      id: "task-1",
      title: "Ship queue leases",
      status: "in_progress",
      assignee: "ai",
      target_runtime: "openclaw",
      execution_mode: "autonomous",
      ai_urgency: 5,
      context_link: "https://example.com/brief",
      input_request: {
        schema_version: "1.0",
        request_id: "req-1",
        type: "choice",
        prompt: "Choose a lane.",
        required: true,
        created_at: "2026-03-01T10:04:00+00:00",
        options: ["main", "staging"],
        allow_multiple: false,
      },
      input_response: {
        type: "choice",
        selections: ["main"],
      },
      active_run_id: "run-1",
      check_in_requested_at: null,
      check_in_requested_by: null,
      created_at: "2026-03-01T10:00:00+00:00",
      updated_at: "2026-03-01T10:05:00+00:00",
      updated_by: "human",
    });

    expect(task).toMatchObject({
      id: "task-1",
      status: "in_progress",
      targetRuntime: "openclaw",
      executionMode: "autonomous",
      activeRunId: "run-1",
      inputRequest: {
        type: "choice",
      },
      inputResponse: {
        type: "choice",
        selections: ["main"],
      },
    });
  });

  it("rejects local ISO timestamps without offsets", () => {
    expect(() =>
      toTask({
        id: "task-2",
        title: "Handle local timestamps",
        status: "blocked",
        assignee: "human",
        target_runtime: null,
        execution_mode: "session",
        ai_urgency: 2,
        context_link: null,
        input_request: {
          schema_version: "1.0",
          request_id: "req-2",
          type: "text_input",
          prompt: "Share the status update.",
          required: true,
          created_at: "2026-03-01T10:04:00",
          multiline: false,
        },
        input_response: null,
        active_run_id: null,
        check_in_requested_at: null,
        check_in_requested_by: null,
        created_at: "2026-03-01T10:00:00",
        updated_at: "2026-03-01T10:05:00+00:00",
        updated_by: "human",
      })
    ).toThrow();
  });

  it("maps notes, runs, activity, and workspaces", () => {
    const note = toNote({
      id: "note-1",
      task_id: "task-1",
      author: "human",
      kind: "attachment",
      content: "Attached the signed approval PDF.",
      attachment: {
        kind: "file",
        filename: "approval.pdf",
        mime_type: "application/pdf",
        size_bytes: 4096,
        download_link: "http://127.0.0.1:8787/files/approval.pdf",
      },
      created_at: "2026-03-01T10:06:00+00:00",
    });
    const run = toRun({
      id: "run-1",
      task_id: "task-1",
      runtime: "openclaw",
      worker_id: "openclaw:autonomous:test:main",
      status: "active",
      started_at: "2026-03-01T10:05:00+00:00",
      last_heartbeat_at: "2026-03-01T10:06:00+00:00",
      ended_at: null,
      lease_seconds: 600,
      end_reason: null,
    });
    const activity = toActivity({
      id: "act-1",
      task_id: "task-1",
      run_id: "run-1",
      runtime: "openclaw",
      actor: "ai",
      kind: "tool_call",
      summary: "Ran migration dry-run.",
      payload: { command: "pnpm typecheck" },
      created_at: "2026-03-01T10:06:30+00:00",
    });
    const workspace = toWorkspace({
      name: "default",
      store: ".data/store.json",
      active: true,
    });

    expect(note.taskId).toBe("task-1");
    expect(note.attachment?.filename).toBe("approval.pdf");
    expect(run.workerId).toBe("openclaw:autonomous:test:main");
    expect(activity.kind).toBe("tool_call");
    expect(workspace).toEqual({ name: "default", store: ".data/store.json", active: true });
  });

  it("keeps outbound wire values normalized", () => {
    expect(statusToWire("in_progress")).toBe("in_progress");
    expect(statusToWire("done")).toBe("done");
    expect(executionModeToWire("session")).toBe("session");
  });

  it("rejects payloads that fail the shared contracts", () => {
    expect(() =>
      toTask({
        id: "task-1",
        title: "Ship queue leases",
        status: "pending",
        assignee: "ai",
        target_runtime: "openclaw",
        execution_mode: "autonomous",
        ai_urgency: 5,
        context_link: null,
        input_request: null,
        input_response: null,
        active_run_id: null,
        check_in_requested_at: null,
        check_in_requested_by: null,
        created_at: "not-a-timestamp",
        updated_at: "2026-03-01T10:05:00+00:00",
        updated_by: "human",
      })
    ).toThrow();

    expect(() =>
      toNote({
        id: "note-1",
        task_id: "task-1",
        author: "human",
        kind: "attachment",
        content: "Broken attachment payload.",
        attachment: {
          kind: "file",
          filename: "approval.pdf",
          download_link: "not-a-url",
        },
        created_at: "2026-03-01T10:06:00+00:00",
      })
    ).toThrow();

    expect(() =>
      toPendingCheckIn({
        requested_at: "still-not-a-timestamp",
        requested_by: "human",
      })
    ).toThrow();
  });
});
