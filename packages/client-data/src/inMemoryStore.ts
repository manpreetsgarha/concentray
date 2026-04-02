import type { Activity, Note, PendingOp, Run, Task } from "./types.js";

export class InMemoryStore {
  private tasks = new Map<string, Task>();
  private notes = new Map<string, Note>();
  private runs = new Map<string, Run>();
  private activity = new Map<string, Activity>();
  private pending: PendingOp[] = [];
  private cursor: string | undefined;

  getTasks(): Task[] {
    return [...this.tasks.values()];
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  upsertTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getNotes(taskId?: string): Note[] {
    const rows = [...this.notes.values()];
    if (!taskId) {
      return rows;
    }
    return rows.filter((note) => note.taskId === taskId);
  }

  upsertNote(note: Note): void {
    this.notes.set(note.id, note);
  }

  getRuns(taskId?: string): Run[] {
    const rows = [...this.runs.values()];
    if (!taskId) {
      return rows;
    }
    return rows.filter((run) => run.taskId === taskId);
  }

  upsertRun(run: Run): void {
    this.runs.set(run.id, run);
  }

  getActivity(taskId?: string): Activity[] {
    const rows = [...this.activity.values()];
    if (!taskId) {
      return rows;
    }
    return rows.filter((entry) => entry.taskId === taskId);
  }

  upsertActivity(entry: Activity): void {
    this.activity.set(entry.id, entry);
  }

  enqueue(op: PendingOp): void {
    this.pending.push(op);
  }

  pendingOps(): PendingOp[] {
    return [...this.pending];
  }

  ackOps(acked: string[]): void {
    const ackSet = new Set(acked);
    this.pending = this.pending.filter((op) => !ackSet.has(op.opId));
  }

  setCursor(cursor: string): void {
    this.cursor = cursor;
  }

  getCursor(): string | undefined {
    return this.cursor;
  }
}
