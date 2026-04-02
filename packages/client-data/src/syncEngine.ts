import { mergeTaskByTimestamp } from "./conflict.js";
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
      const merged = mergeTaskByTimestamp(localTask, remoteTask);
      this.store.upsertTask(merged);
    }

    for (const note of delta.notes) {
      this.store.upsertNote(note);
    }

    for (const run of delta.runs) {
      this.store.upsertRun(run);
    }

    for (const entry of delta.activity) {
      this.store.upsertActivity(entry);
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
    patch: Partial<Omit<Task, "id" | "createdAt">>,
    updatedBy: Task["updatedBy"],
    at: string
  ): Task {
    return {
      ...task,
      ...patch,
      updatedAt: at,
      updatedBy
    };
  }
}
