import type { Activity, Note, Run, Task } from "./types.js";
import type { InMemoryStore } from "./inMemoryStore.js";

export interface TaskRepository {
  list(filter?: Partial<Pick<Task, "assignee" | "status">>): Promise<Task[]>;
  get(taskId: string): Promise<Task | null>;
  upsert(task: Task): Promise<Task>;
}

export interface NoteRepository {
  listByTask(taskId: string): Promise<Note[]>;
  create(note: Note): Promise<Note>;
}

export interface RunRepository {
  listByTask(taskId: string): Promise<Run[]>;
  upsert(run: Run): Promise<Run>;
}

export interface ActivityRepository {
  listByTask(taskId: string): Promise<Activity[]>;
  create(entry: Activity): Promise<Activity>;
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

export class LocalNoteRepository implements NoteRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listByTask(taskId: string): Promise<Note[]> {
    return this.store.getNotes(taskId);
  }

  async create(note: Note): Promise<Note> {
    this.store.upsertNote(note);
    return note;
  }
}

export class LocalRunRepository implements RunRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listByTask(taskId: string): Promise<Run[]> {
    return this.store.getRuns(taskId);
  }

  async upsert(run: Run): Promise<Run> {
    this.store.upsertRun(run);
    return run;
  }
}

export class LocalActivityRepository implements ActivityRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listByTask(taskId: string): Promise<Activity[]> {
    return this.store.getActivity(taskId);
  }

  async create(entry: Activity): Promise<Activity> {
    this.store.upsertActivity(entry);
    return entry;
  }
}
