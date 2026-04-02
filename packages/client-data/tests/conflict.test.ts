import { describe, expect, it } from "vitest";
import { mergeTaskByTimestamp } from "../src/conflict.js";
import type { Task } from "../src/types.js";

function baseTask(): Task {
  return {
    id: "task-1",
    title: "Original",
    status: "pending",
    assignee: "ai",
    executionMode: "autonomous",
    targetRuntime: "openclaw",
    aiUrgency: 3,
    contextLink: null,
    inputRequest: null,
    inputResponse: null,
    activeRunId: null,
    checkInRequestedAt: null,
    checkInRequestedBy: null,
    createdAt: "2026-03-03T12:00:00Z",
    updatedAt: "2026-03-03T12:00:00Z",
    updatedBy: "human"
  };
}

describe("mergeTaskByTimestamp", () => {
  it("keeps the newer task by updated_at", () => {
    const local = {
      ...baseTask(),
      title: "Local Title",
      updatedAt: "2026-03-03T12:10:00Z"
    };

    const remote = {
      ...baseTask(),
      status: "blocked" as const,
      updatedAt: "2026-03-03T12:11:00Z",
      updatedBy: "ai" as const
    };

    const merged = mergeTaskByTimestamp(local, remote);
    expect(merged.title).toBe("Original");
    expect(merged.status).toBe("blocked");
  });

  it("uses a deterministic tie-breaker for equal timestamps", () => {
    const local = baseTask();
    const remote = {
      ...baseTask(),
      id: "task-2",
      title: "Remote title",
      updatedAt: "2026-03-03T12:00:00Z"
    };

    const merged = mergeTaskByTimestamp(local, remote);
    expect(merged.title).toBe("Remote title");
  });
});
