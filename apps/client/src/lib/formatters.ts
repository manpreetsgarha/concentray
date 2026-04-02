import type { Task, TaskStatus } from "../types";

export function workspaceAccent(name: string): string {
  const palette = ["#00d4aa", "#5b8def", "#a78bfa", "#f59e0b", "#f472b6", "#34d399"];
  const hash = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? "#00d4aa";
}

export function formatBytes(value?: number): string {
  if (!value || value <= 0) {
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
  const statusRank: Record<TaskStatus, number> = {
    Blocked: 0,
    "In Progress": 1,
    Pending: 2,
    Done: 3
  };

  return [...tasks].sort((left, right) => {
    const rankDelta = statusRank[left.status] - statusRank[right.status];
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}
