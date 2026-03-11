import { mergeTaskFieldLevel } from "./conflict.js";
import type { InMemoryStore } from "./inMemoryStore.js";
import type { SyncTransport, Task } from "./types.js";

export class SyncEngine {
  constructor(
    private readonly store: InMemoryStore,
    private readonly transport: SyncTransport
  ) {}

  async pull(): Promise<void> {
    const cursor = this.store.getCursor();
    const delta = await this.transport.pull(cursor);

    for (const remoteTask of delta.tasks) {
      const localTask = this.store.getTask(remoteTask.id);
      if (!localTask) {
        this.store.upsertTask(remoteTask);
        continue;
      }
      const merged = mergeTaskFieldLevel(localTask, remoteTask);
      this.store.upsertTask(merged);
    }

    for (const comment of delta.comments) {
      this.store.upsertComment(comment);
    }

    this.store.setCursor(delta.cursor);
  }

  async push(): Promise<void> {
    const ops = this.store.pendingOps();
    if (ops.length === 0) {
      return;
    }

    const result = await this.transport.push(ops);
    this.store.ackOps(result.ackedOpIds);
  }

  async syncCycle(): Promise<void> {
    await this.push();
    await this.pull();
  }

  static patchTask(
    task: Task,
    patch: Partial<Omit<Task, "id" | "createdAt" | "createdBy">>,
    updatedBy: Task["updatedBy"],
    at: string
  ): Task {
    const next = {
      ...task,
      ...patch,
      updatedAt: at,
      updatedBy,
      version: task.version + 1,
      fieldClock: { ...task.fieldClock }
    };

    for (const [key, value] of Object.entries(patch)) {
      if (typeof value !== "undefined") {
        next.fieldClock[key] = at;
      }
    }

    return next;
  }
}
