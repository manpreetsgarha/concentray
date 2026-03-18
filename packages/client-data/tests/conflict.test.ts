import { describe, expect, it } from "vitest";
import { mergeTaskFieldLevel } from "../src/conflict.js";
import type { Task } from "../src/types.js";

function baseTask(): Task {
  return {
    id: "task-1",
    title: "Original",
    status: "Pending",
    createdBy: "Human",
    assignee: "AI",
    executionMode: "Autonomous",
    createdAt: "2026-03-03T12:00:00Z",
    updatedAt: "2026-03-03T12:00:00Z",
    updatedBy: "Human",
    version: 1,
    fieldClock: {
      title: "2026-03-03T12:00:00Z",
      status: "2026-03-03T12:00:00Z",
      assignee: "2026-03-03T12:00:00Z",
      executionMode: "2026-03-03T12:00:00Z"
    }
  };
}

describe("mergeTaskFieldLevel", () => {
  it("keeps newer local field and newer remote field independently", () => {
    const local = {
      ...baseTask(),
      title: "Local Title",
      fieldClock: {
        title: "2026-03-03T12:10:00Z",
        status: "2026-03-03T12:00:00Z",
        assignee: "2026-03-03T12:00:00Z",
        executionMode: "2026-03-03T12:00:00Z"
      },
      updatedAt: "2026-03-03T12:10:00Z",
      version: 2
    };

    const remote = {
      ...baseTask(),
      status: "Blocked" as const,
      fieldClock: {
        title: "2026-03-03T12:00:00Z",
        status: "2026-03-03T12:11:00Z",
        assignee: "2026-03-03T12:00:00Z",
        executionMode: "2026-03-03T12:00:00Z"
      },
      updatedAt: "2026-03-03T12:11:00Z",
      updatedBy: "AI" as const,
      version: 3
    };

    const merged = mergeTaskFieldLevel(local, remote);
    expect(merged.title).toBe("Local Title");
    expect(merged.status).toBe("Blocked");
    expect(merged.version).toBe(3);
  });

  it("uses remote tie-breaker for equal field clocks", () => {
    const local = baseTask();
    const remote = {
      ...baseTask(),
      title: "Remote title",
      updatedAt: "2026-03-03T12:00:00Z"
    };

    const merged = mergeTaskFieldLevel(local, remote);
    expect(merged.title).toBe("Remote title");
  });
});
