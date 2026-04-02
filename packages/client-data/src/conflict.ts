import type { Task } from "./types.js";

export function mergeTaskByTimestamp(local: Task, remote: Task): Task {
  if (remote.updatedAt > local.updatedAt) {
    return remote;
  }
  if (remote.updatedAt < local.updatedAt) {
    return local;
  }
  return remote.id >= local.id ? remote : local;
}
