import type { Comment, PendingOp, Task } from "./types.js";

export class InMemoryStore {
  private tasks = new Map<string, Task>();
  private comments = new Map<string, Comment>();
  private pending: PendingOp[] = [];
  private cursor: string | undefined;

  getTasks(): Task[] {
    return [...this.tasks.values()].filter((task) => !task.deletedAt);
  }

  getTask(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (task?.deletedAt) {
      return undefined;
    }
    return task;
  }

  upsertTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getComments(taskId?: string): Comment[] {
    const rows = [...this.comments.values()].filter((comment) => !comment.deletedAt);
    if (!taskId) {
      return rows;
    }
    return rows.filter((comment) => comment.taskId === taskId);
  }

  upsertComment(comment: Comment): void {
    this.comments.set(comment.id, comment);
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
