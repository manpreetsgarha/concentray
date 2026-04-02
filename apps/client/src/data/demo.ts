import { seedComments, seedTasks, seedWorkspaces } from "../mockData";
import type { Actor, Comment, Task, TaskExecutionMode, TaskStatus, WorkspaceSummary } from "../types";

export interface DemoWorkspaceRecord {
  summary: WorkspaceSummary;
  tasks: Task[];
  comments: Comment[];
}

export interface TaskDraft {
  title: string;
  status: TaskStatus;
  createdBy: Actor;
  assignee: Actor;
  executionMode: TaskExecutionMode;
  aiUrgency: number;
  contextLink: string;
}

export function createTaskDraft(task: Task | null): TaskDraft {
  return {
    title: task?.title ?? "",
    status: task?.status ?? "Pending",
    createdBy: task?.createdBy ?? "Human",
    assignee: task?.assignee ?? "AI",
    executionMode: task?.executionMode ?? "Autonomous",
    aiUrgency: task?.aiUrgency ?? 3,
    contextLink: task?.contextLink ?? ""
  };
}

export function buildDemoWorkspaces(): DemoWorkspaceRecord[] {
  const secondTask: Task = {
    id: "task-seed-3",
    title: "Draft launch narrative for concierge automation",
    status: "Pending",
    createdBy: "Human",
    assignee: "AI",
    executionMode: "Autonomous",
    aiUrgency: 4,
    contextLink: "https://example.com/workspaces/motion-lab/brief",
    inputRequest: null,
    inputResponse: null,
    updatedAt: "2026-03-04T09:10:00Z"
  };

  const secondComment: Comment = {
    id: "c-3",
    taskId: "task-seed-3",
    author: "Human",
    type: "message",
    message: "Need a homepage story arc that feels precise, not generic.",
    timestamp: "2026-03-04T09:12:00Z"
  };

  return [
    {
      summary: { ...seedWorkspaces[0], active: true },
      tasks: seedTasks,
      comments: seedComments
    },
    {
      summary: { ...seedWorkspaces[1], active: false },
      tasks: [secondTask],
      comments: [secondComment]
    }
  ];
}
