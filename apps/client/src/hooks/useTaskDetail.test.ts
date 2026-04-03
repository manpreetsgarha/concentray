import { describe, expect, it, vi } from "vitest";

import {
  createTaskDetailLoader,
  EMPTY_TASK_DETAIL,
  type TaskDetailSnapshot,
} from "./useTaskDetail";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function makeTaskPayload(requestedBy: string) {
  return {
    ok: true,
    active_run: {
      id: `run-${requestedBy}`,
      task_id: `task-${requestedBy}`,
      runtime: "openclaw",
      worker_id: `openclaw:autonomous:test:${requestedBy}`,
      status: "active",
      started_at: "2026-03-01T10:05:00+00:00",
      last_heartbeat_at: "2026-03-01T10:06:00+00:00",
      ended_at: null,
      lease_seconds: 600,
      end_reason: null,
    },
    pending_check_in: {
      requested_at: "2026-03-01T10:06:00+00:00",
      requested_by: requestedBy,
    },
  };
}

function makeNotesPayload(noteId: string) {
  return {
    ok: true,
    notes: [
      {
        id: noteId,
        task_id: "task-1",
        author: "human",
        kind: "note",
        content: `note-${noteId}`,
        attachment: null,
        created_at: "2026-03-01T10:06:00+00:00",
      },
    ],
  };
}

function makeActivityPayload(summary: string) {
  return {
    ok: true,
    activity: [
      {
        id: `activity-${summary}`,
        task_id: "task-1",
        run_id: null,
        runtime: null,
        actor: "human",
        kind: "note_added",
        summary,
        payload: null,
        created_at: "2026-03-01T10:06:30+00:00",
      },
    ],
  };
}

describe("createTaskDetailLoader", () => {
  it("ignores stale responses from an older task request", async () => {
    const inflight = new Map<string, ReturnType<typeof deferred<Record<string, unknown>>>>();
    const applySnapshot = vi.fn<(snapshot: TaskDetailSnapshot) => void>();
    const onError = vi.fn<(message: string | null) => void>();
    const apiRequest = vi.fn((path: string) => {
      const next = deferred<Record<string, unknown>>();
      inflight.set(path, next);
      return next.promise;
    });

    const loadTaskDetail = createTaskDetailLoader({
      apiRequest,
      onError,
      applySnapshot,
      transition: (callback) => callback(),
    });

    const firstRequest = loadTaskDetail("task-a");
    const secondRequest = loadTaskDetail("task-b");

    inflight.get("/tasks/task-b")?.resolve(makeTaskPayload("human"));
    inflight.get("/tasks/task-b/notes")?.resolve(makeNotesPayload("note-b"));
    inflight.get("/tasks/task-b/activity")?.resolve(makeActivityPayload("activity-b"));
    await secondRequest;

    inflight.get("/tasks/task-a")?.resolve(makeTaskPayload("ai"));
    inflight.get("/tasks/task-a/notes")?.resolve(makeNotesPayload("note-a"));
    inflight.get("/tasks/task-a/activity")?.resolve(makeActivityPayload("activity-a"));
    await firstRequest;

    expect(applySnapshot).toHaveBeenNthCalledWith(1, EMPTY_TASK_DETAIL);
    expect(applySnapshot).toHaveBeenNthCalledWith(2, EMPTY_TASK_DETAIL);
    expect(applySnapshot).toHaveBeenLastCalledWith({
      run: expect.objectContaining({ id: "run-human" }),
      notes: [expect.objectContaining({ id: "note-b", content: "note-note-b" })],
      activity: [expect.objectContaining({ summary: "activity-b" })],
      pendingCheckIn: expect.objectContaining({ requested_by: "human" }),
    });
    expect(applySnapshot).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledWith(null);
  });

  it("clears stale detail and reports errors for the active request", async () => {
    const inflight = new Map<string, ReturnType<typeof deferred<Record<string, unknown>>>>();
    const applySnapshot = vi.fn<(snapshot: TaskDetailSnapshot) => void>();
    const onError = vi.fn<(message: string | null) => void>();
    const apiRequest = vi.fn((path: string) => {
      const next = deferred<Record<string, unknown>>();
      inflight.set(path, next);
      return next.promise;
    });

    const loadTaskDetail = createTaskDetailLoader({
      apiRequest,
      onError,
      applySnapshot,
      transition: (callback) => callback(),
    });

    const firstRequest = loadTaskDetail("task-a");
    inflight.get("/tasks/task-a")?.resolve(makeTaskPayload("human"));
    inflight.get("/tasks/task-a/notes")?.resolve(makeNotesPayload("note-a"));
    inflight.get("/tasks/task-a/activity")?.resolve(makeActivityPayload("activity-a"));
    await firstRequest;

    const secondRequest = loadTaskDetail("task-b");
    inflight.get("/tasks/task-b")?.reject(new Error("Task detail load failed"));
    inflight.get("/tasks/task-b/notes")?.resolve(makeNotesPayload("note-b"));
    inflight.get("/tasks/task-b/activity")?.resolve(makeActivityPayload("activity-b"));
    await secondRequest;

    expect(applySnapshot).toHaveBeenLastCalledWith(EMPTY_TASK_DETAIL);
    expect(onError).toHaveBeenLastCalledWith("Task detail load failed");
  });
});
