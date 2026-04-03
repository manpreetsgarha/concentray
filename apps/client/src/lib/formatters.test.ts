import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatTimestamp,
  humanStatus,
  looksLikeUrl,
  sortTasks,
} from "./formatters";
import type { Task } from "../types";

function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? "pending",
    assignee: overrides.assignee ?? "ai",
    targetRuntime: overrides.targetRuntime ?? null,
    executionMode: overrides.executionMode ?? "autonomous",
    contextLink: overrides.contextLink ?? null,
    aiUrgency: overrides.aiUrgency ?? 3,
    inputRequest: overrides.inputRequest ?? null,
    inputResponse: overrides.inputResponse ?? null,
    activeRunId: overrides.activeRunId ?? null,
    checkInRequestedAt: overrides.checkInRequestedAt ?? null,
    checkInRequestedBy: overrides.checkInRequestedBy ?? null,
    createdAt: overrides.createdAt ?? "2026-03-03T10:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-03-03T10:00:00Z",
    updatedBy: overrides.updatedBy ?? "human",
  };
}

describe("sortTasks", () => {
  it("mirrors backend queue order for targeted and shared tasks", () => {
    const tasks = [
      makeTask({
        id: "shared-a",
        targetRuntime: null,
        aiUrgency: 5,
        status: "pending",
        createdAt: "2026-03-03T10:00:00Z",
      }),
      makeTask({
        id: "target-done-old",
        targetRuntime: "openclaw",
        aiUrgency: 5,
        status: "done",
        createdAt: "2026-03-03T09:59:00Z",
      }),
      makeTask({
        id: "target-pending-new",
        targetRuntime: "openclaw",
        aiUrgency: 5,
        status: "pending",
        createdAt: "2026-03-03T10:01:00Z",
      }),
      makeTask({
        id: "target-low",
        targetRuntime: "openclaw",
        aiUrgency: 4,
        status: "blocked",
        createdAt: "2026-03-03T09:58:00Z",
      }),
      makeTask({
        id: "shared-b",
        targetRuntime: null,
        aiUrgency: 5,
        status: "in_progress",
        createdAt: "2026-03-03T10:00:00Z",
      }),
    ];

    expect(sortTasks(tasks).map((task) => task.id)).toEqual([
      "target-done-old",
      "target-pending-new",
      "target-low",
      "shared-a",
      "shared-b",
    ]);
  });
});

describe("formatter helpers", () => {
  it("formats bytes without treating unknown as zero", () => {
    expect(formatBytes(undefined)).toBe("Unknown");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats timestamps and falls back safely", () => {
    expect(formatTimestamp("2026-03-03T10:00:00+00:00")).toContain("Mar");
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatTimestamp()).toBe("Unknown");
  });

  it("detects URLs and humanizes status", () => {
    expect(looksLikeUrl("https://example.com")).toBe(true);
    expect(looksLikeUrl("ftp://example.com")).toBe(false);
    expect(looksLikeUrl("not-a-url")).toBe(false);
    expect(humanStatus("in_progress")).toBe("In Progress");
  });
});
