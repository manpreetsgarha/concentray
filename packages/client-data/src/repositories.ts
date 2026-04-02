import type { Comment, Task } from "./types.js";
import type { InMemoryStore } from "./inMemoryStore.js";

export interface TaskRepository {
  list(filter?: Partial<Pick<Task, "assignee" | "status">>): Promise<Task[]>;
  get(taskId: string): Promise<Task | null>;
  upsert(task: Task): Promise<Task>;
}

export interface CommentRepository {
  listByTask(taskId: string): Promise<Comment[]>;
  create(comment: Comment): Promise<Comment>;
}

export class LocalTaskRepository implements TaskRepository {
  constructor(private readonly store: InMemoryStore) {}

  async list(filter?: Partial<Pick<Task, "assignee" | "status">>): Promise<Task[]> {
    const tasks = this.store.getTasks();
    return tasks.filter((task) => {
      if (filter?.assignee && task.assignee !== filter.assignee) {
        return false;
      }
      if (filter?.status && task.status !== filter.status) {
        return false;
      }
      return true;
    });
  }

  async get(taskId: string): Promise<Task | null> {
    return this.store.getTask(taskId) ?? null;
  }

  async upsert(task: Task): Promise<Task> {
    this.store.upsertTask(task);
    return task;
  }
}

export class LocalCommentRepository implements CommentRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listByTask(taskId: string): Promise<Comment[]> {
    return this.store.getComments(taskId);
  }

  async create(comment: Comment): Promise<Comment> {
    this.store.upsertComment(comment);
    return comment;
  }
}
