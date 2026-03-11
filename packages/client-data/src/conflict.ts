import type { Task } from "./types.js";

const SYSTEM_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "version",
  "fieldClock",
  "deletedAt"
]);

export function mergeTaskFieldLevel(local: Task, remote: Task): Task {
  const merged: Task = {
    ...local,
    fieldClock: { ...local.fieldClock }
  };
  const mergedRecord = merged as unknown as Record<string, unknown>;
  const remoteRecord = remote as unknown as Record<string, unknown>;

  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    if (SYSTEM_FIELDS.has(key)) {
      continue;
    }

    const localClock = local.fieldClock[key] ?? local.updatedAt;
    const remoteClock = remote.fieldClock[key] ?? remote.updatedAt;

    if (remoteClock > localClock) {
      mergedRecord[key] = remoteRecord[key];
      merged.fieldClock[key] = remoteClock;
      continue;
    }

    if (remoteClock === localClock) {
      // Deterministic tie-breaker: remote wins when clocks are equal.
      mergedRecord[key] = remoteRecord[key];
      merged.fieldClock[key] = remoteClock;
    }
  }

  merged.updatedAt =
    remote.updatedAt > local.updatedAt ? remote.updatedAt : local.updatedAt;
  merged.updatedBy = remote.updatedAt >= local.updatedAt ? remote.updatedBy : local.updatedBy;
  merged.version = Math.max(local.version, remote.version);
  merged.deletedAt = remote.deletedAt ?? local.deletedAt ?? null;

  return merged;
}
