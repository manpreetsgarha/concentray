import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { reconcileSelectedTaskId, useTaskOverview } from "./useTaskOverview";
import type { Task, WorkspaceSummary } from "../types";

interface OverviewHarnessValue {
  workspaces: WorkspaceSummary[];
  tasks: Task[];
  selectedTaskId: string;
  selectedTask: Task | null;
  filteredTasks: Task[];
  taskQuery: string;
  statusFilter: "all" | Task["status"];
  assigneeFilter: "all" | Task["assignee"];
  refreshing: boolean;
  loadOverview: () => Promise<void>;
  setSelectedTaskId: (value: string) => void;
  setTaskQuery: (value: string) => void;
  setStatusFilter: (value: "all" | Task["status"]) => void;
  setAssigneeFilter: (value: "all" | Task["assignee"]) => void;
}

interface HookHarnessProps {
  apiRequest: (path: string) => Promise<Record<string, unknown>>;
  onError: (message: string | null) => void;
  onReady: (value: OverviewHarnessValue) => void;
}

function HookHarness({ apiRequest, onError, onReady }: HookHarnessProps) {
  const value = useTaskOverview({ apiRequest, onError });

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function makeTask(id: string): Task {
  return {
    id,
    title: id,
    status: "pending",
    assignee: "ai",
    targetRuntime: "openclaw",
    executionMode: "autonomous",
    contextLink: null,
    aiUrgency: 3,
    inputRequest: null,
    inputResponse: null,
    activeRunId: null,
    checkInRequestedAt: null,
    checkInRequestedBy: null,
    createdAt: "2026-03-03T10:00:00+00:00",
    updatedAt: "2026-03-03T10:00:00+00:00",
    updatedBy: "human",
  };
}

function makeWireTask(
  id: string,
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id,
    title: id,
    status: "pending",
    assignee: "ai",
    target_runtime: "openclaw",
    execution_mode: "autonomous",
    ai_urgency: 3,
    context_link: null,
    input_request: null,
    input_response: null,
    active_run_id: null,
    check_in_requested_at: null,
    check_in_requested_by: null,
    created_at: "2026-03-03T10:00:00+00:00",
    updated_at: "2026-03-03T10:00:00+00:00",
    updated_by: "human",
    ...overrides,
  };
}

describe("reconcileSelectedTaskId", () => {
  it("keeps the current selection when it still exists", () => {
    expect(reconcileSelectedTaskId("task-2", [makeTask("task-1"), makeTask("task-2")])).toBe("task-2");
  });

  it("does not clear a selection on a transient empty refresh", () => {
    expect(reconcileSelectedTaskId("task-2", [])).toBe("task-2");
  });

  it("falls back to the first task when the selection disappears", () => {
    expect(reconcileSelectedTaskId("missing", [makeTask("task-1"), makeTask("task-2")])).toBe("task-1");
  });

  it("stays empty when there is no selection and no tasks", () => {
    expect(reconcileSelectedTaskId("", [])).toBe("");
  });
});

describe("useTaskOverview", () => {
  it("loads overview data and filters tasks by status, assignee, and query", async () => {
    const apiRequest = vi.fn(async (path: string) => {
      if (path === "/workspaces") {
        return {
          ok: true,
          workspaces: [
            { name: "default", store: ".data/default.json", active: true },
            { name: "archive", store: ".data/archive.json", active: false },
          ],
        };
      }
      return {
        ok: true,
        tasks: [
          makeWireTask("task-ai", {
            title: "Queue release train",
            status: "pending",
            assignee: "ai",
            ai_urgency: 5,
          }),
          makeWireTask("task-human", {
            title: "Review blocker reply",
            status: "blocked",
            assignee: "human",
            target_runtime: null,
            execution_mode: "session",
          }),
        ],
      };
    });
    const onError = vi.fn();
    let current: OverviewHarnessValue | null = null;
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        React.createElement(HookHarness, {
          apiRequest,
          onError,
          onReady: (value: OverviewHarnessValue) => {
            current = value;
          },
        })
      );
      await Promise.resolve();
    });

    if (!current || !renderer) {
      throw new Error("Hook harness did not initialize");
    }
    const overview = current as OverviewHarnessValue;
    const testRenderer = renderer as ReturnType<typeof create>;

    expect(overview.workspaces).toEqual([
      { name: "default", store: ".data/default.json", active: true },
      { name: "archive", store: ".data/archive.json", active: false },
    ]);
    expect(overview.tasks.map((task) => task.id)).toEqual(["task-ai", "task-human"]);
    expect(overview.selectedTaskId).toBe("task-ai");
    expect(overview.selectedTask?.id).toBe("task-ai");
    expect(onError).toHaveBeenCalledWith(null);

    await act(async () => {
      overview.setStatusFilter("blocked");
      overview.setAssigneeFilter("human");
      overview.setTaskQuery("reply");
      await Promise.resolve();
    });

    expect((current as OverviewHarnessValue).filteredTasks.map((task) => task.id)).toEqual(["task-human"]);

    testRenderer.unmount();
  });

  it("ignores stale overview responses from an older refresh", async () => {
    const pending = new Map<string, Array<ReturnType<typeof deferred<Record<string, unknown>>>>>();
    const apiRequest = vi.fn((path: string) => {
      const request = deferred<Record<string, unknown>>();
      const requests = pending.get(path) ?? [];
      requests.push(request);
      pending.set(path, requests);
      return request.promise;
    });
    const onError = vi.fn();
    let current: OverviewHarnessValue | null = null;
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        React.createElement(HookHarness, {
          apiRequest,
          onError,
          onReady: (value: OverviewHarnessValue) => {
            current = value;
          },
        })
      );
      await Promise.resolve();
    });

    if (!current || !renderer) {
      throw new Error("Hook harness did not initialize");
    }
    const testRenderer = renderer as ReturnType<typeof create>;

    const secondLoad = (current as OverviewHarnessValue).loadOverview();

    pending.get("/workspaces")?.[1]?.resolve({
      ok: true,
      workspaces: [{ name: "new", store: ".data/new.json", active: true }],
    });
    pending.get("/tasks")?.[1]?.resolve({
      ok: true,
      tasks: [makeWireTask("task-new", { title: "Newest data" })],
    });
    await act(async () => {
      await secondLoad;
    });

    pending.get("/workspaces")?.[0]?.resolve({
      ok: true,
      workspaces: [{ name: "old", store: ".data/old.json", active: true }],
    });
    pending.get("/tasks")?.[0]?.resolve({
      ok: true,
      tasks: [makeWireTask("task-old", { title: "Stale data" })],
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect((current as OverviewHarnessValue).workspaces).toEqual([
      { name: "new", store: ".data/new.json", active: true },
    ]);
    expect((current as OverviewHarnessValue).tasks.map((task) => task.id)).toEqual(["task-new"]);
    expect((current as OverviewHarnessValue).selectedTaskId).toBe("task-new");

    testRenderer.unmount();
  });
});
