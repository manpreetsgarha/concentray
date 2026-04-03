import { describe, expect, it } from "vitest";

import { reconcileSelectedTaskId } from "./useTaskOverview";
import type { Task } from "../types";

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
