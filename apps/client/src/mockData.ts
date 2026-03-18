import type { Comment, Task, WorkspaceSummary } from "./types";

export const seedWorkspaces: WorkspaceSummary[] = [
  {
    name: "default",
    provider: "local_json",
    store: ".data/store.json",
    active: true
  },
  {
    name: "motion-lab",
    provider: "local_json",
    store: ".data/workspaces/motion-lab.json",
    active: false
  }
];

export const seedTasks: Task[] = [
  {
    id: "task-seed-1",
    title: "Format Q3 financial reports",
    status: "Blocked",
    createdBy: "Human",
    assignee: "AI",
    executionMode: "Autonomous",
    contextLink: "https://example.com/workspaces/q3-finance",
    aiUrgency: 5,
    updatedAt: "2026-03-03T10:00:00Z",
    inputRequest: {
      schema_version: "1.0",
      request_id: "req-1",
      type: "choice",
      prompt: "Which branch should be used?",
      required: true,
      created_at: "2026-03-03T10:00:00Z",
      options: ["main", "staging"],
      allow_multiple: false
    }
  },
  {
    id: "task-seed-2",
    title: "Collect invoice PDFs",
    status: "In Progress",
    createdBy: "AI",
    assignee: "Human",
    executionMode: "Session",
    aiUrgency: 2,
    updatedAt: "2026-03-03T10:05:00Z",
    inputRequest: null
  }
];

export const seedComments: Comment[] = [
  {
    id: "c-1",
    taskId: "task-seed-1",
    author: "AI",
    type: "log",
    message: "Parsing complete. Need target branch to proceed.",
    timestamp: "2026-03-03T10:00:05Z"
  },
  {
    id: "c-2",
    taskId: "task-seed-2",
    author: "AI",
    type: "message",
    message: "Please upload latest invoice batch.",
    timestamp: "2026-03-03T10:05:05Z"
  }
];
