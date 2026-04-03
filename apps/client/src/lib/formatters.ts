import type { Task } from "../types";

export function workspaceAccent(name: string): string {
  const palette = ["#00d4aa", "#5b8def", "#a78bfa", "#f59e0b", "#f472b6", "#34d399"];
  const hash = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? "#00d4aa";
}

export function formatBytes(value?: number): string {
  if (value === undefined) {
    return "Unknown";
  }
  if (value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function humanStatus(status: Task["status"]): string {
  if (status === "in_progress") {
    return "In Progress";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  if (status === "done") {
    return "Done";
  }
  return "Pending";
}

export function humanRuntime(runtime?: string | null): string {
  if (runtime === "openclaw") {
    return "OpenClaw";
  }
  if (runtime === "claude") {
    return "Claude";
  }
  if (runtime === "codex") {
    return "Codex";
  }
  return "Any";
}

export function humanExecutionMode(mode: Task["executionMode"]): string {
  return mode === "session" ? "Session" : "Autonomous";
}

export function humanAssignee(assignee: Task["assignee"]): string {
  return assignee === "ai" ? "AI" : "Human";
}

export function looksLikeUrl(value?: string): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatMetadataJson(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return null;
  }
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const targetedRankLeft = left.targetRuntime ? 0 : 1;
    const targetedRankRight = right.targetRuntime ? 0 : 1;
    if (targetedRankLeft !== targetedRankRight) {
      return targetedRankLeft - targetedRankRight;
    }
    if (left.aiUrgency !== right.aiUrgency) {
      return right.aiUrgency - left.aiUrgency;
    }
    const createdDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdDelta !== 0) {
      return createdDelta;
    }
    return left.id.localeCompare(right.id);
  });
}
