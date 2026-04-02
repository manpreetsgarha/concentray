import { describe, expect, it } from "vitest";

import { executionModeToWire, statusToWire, toActivity, toNote, toRun, toTask, toWorkspace } from "./wire";

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
      input_request: null,
      input_response: null,
      active_run_id: "run-1",
      check_in_requested_at: null,
      check_in_requested_by: null,
      created_at: "2026-03-01T10:00:00Z",
      updated_at: "2026-03-01T10:05:00Z",
      updated_by: "human",
    });

    expect(task).toMatchObject({
      id: "task-1",
      status: "in_progress",
      targetRuntime: "openclaw",
      executionMode: "autonomous",
      activeRunId: "run-1",
    });
  });

  it("maps notes, runs, activity, and workspaces", () => {
    const note = toNote({
      id: "note-1",
      task_id: "task-1",
      author: "human",
      kind: "note",
      content: "Needs a cleaner run lease model.",
      attachment: null,
      created_at: "2026-03-01T10:06:00Z",
    });
    const run = toRun({
      id: "run-1",
      task_id: "task-1",
      runtime: "openclaw",
      worker_id: "openclaw:autonomous:test:main",
      status: "active",
      started_at: "2026-03-01T10:05:00Z",
      last_heartbeat_at: "2026-03-01T10:06:00Z",
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
      created_at: "2026-03-01T10:06:30Z",
    });
    const workspace = toWorkspace({
      name: "default",
      store: ".data/store.json",
      active: true,
    });

    expect(note.taskId).toBe("task-1");
    expect(run.workerId).toBe("openclaw:autonomous:test:main");
    expect(activity.kind).toBe("tool_call");
    expect(workspace).toEqual({ name: "default", store: ".data/store.json", active: true });
  });

  it("keeps outbound wire values normalized", () => {
    expect(statusToWire("in_progress")).toBe("in_progress");
    expect(statusToWire("done")).toBe("done");
    expect(executionModeToWire("session")).toBe("session");
  });
});
