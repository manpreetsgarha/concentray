import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  type ImageStyle,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";

import { BlockerCard } from "./src/BlockerCard";
import type { Actor, Comment, Task, TaskExecutionMode, TaskStatus, WorkspaceSummary } from "./src/types";
import { buildDemoWorkspaces, createTaskDraft, type DemoWorkspaceRecord, type TaskDraft } from "./src/data/demo";
import {
  executionModeToWire,
  statusToWire,
  toComment,
  toTask,
  toWorkspace,
  type WireComment,
  type WireTask,
  type WireWorkspace
} from "./src/data/wire";
import { formatBytes, formatMetadataJson, formatTimestamp, looksLikeUrl, sortTasks } from "./src/lib/formatters";
import { pickFileForUpload, type UploadDraft } from "./src/lib/uploads";
import { LogoMark } from "./src/ui/brand/LogoMark";
import { ChoiceGroup, type ChoiceOption } from "./src/ui/forms/ChoiceGroup";
import { FilterChip } from "./src/ui/forms/FilterChip";
import { AttachmentVideoPreview } from "./src/ui/tasks/AttachmentVideoPreview";
import { TaskListItem } from "./src/ui/tasks/TaskListItem";
import { WorkspaceCard } from "./src/ui/workspaces/WorkspaceCard";

type ActivityView = "comments" | "logs";

function statusBarStyle(status: TaskStatus) {
  if (status === "Blocked") return styles.statusBarBlocked;
  if (status === "In Progress") return styles.statusBarInProgress;
  if (status === "Done") return styles.statusBarDone;
  return styles.statusBarPending;
}

export default function App() {
  const { width } = useWindowDimensions();
  const singleColumn = width < 960;

  const [demoWorkspaces, setDemoWorkspaces] = useState<DemoWorkspaceRecord[]>(() => buildDemoWorkspaces());
  const [remoteWorkspaces, setRemoteWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [remoteTasks, setRemoteTasks] = useState<Task[]>([]);
  const [remoteComments, setRemoteComments] = useState<Comment[]>([]);

  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => createTaskDraft(null));
  const [newTitle, setNewTitle] = useState("");
  const [newContextLink, setNewContextLink] = useState("");
  const [newAssignee, setNewAssignee] = useState<Actor>("AI");
  const [newExecutionMode, setNewExecutionMode] = useState<TaskExecutionMode>("Autonomous");
  const [newCreatedBy, setNewCreatedBy] = useState<Actor>("Human");
  const [newUrgency, setNewUrgency] = useState(3);
  const [commentDraft, setCommentDraft] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | TaskStatus>("All");
  const [assigneeFilter, setAssigneeFilter] = useState<"All" | Actor>("All");
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [statusUpdatingTaskId, setStatusUpdatingTaskId] = useState<string>("");
  const [taskDeleting, setTaskDeleting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [taskCreating, setTaskCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showWorkspaceCreator, setShowWorkspaceCreator] = useState(false);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<WorkspaceSummary | null>(null);
  const [taskDeleteTarget, setTaskDeleteTarget] = useState<Task | null>(null);
  const [showQueueFilters, setShowQueueFilters] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [activityView, setActivityView] = useState<ActivityView>("comments");
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);

  const sharedApiUrl = (process.env.EXPO_PUBLIC_LOCAL_API_URL ?? "").trim();
  const uploadLimitMbRaw = Number(process.env.EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB ?? "25");
  const uploadLimitMb = Number.isFinite(uploadLimitMbRaw) && uploadLimitMbRaw > 0 ? uploadLimitMbRaw : 25;
  const uploadLimitBytes = Math.round(uploadLimitMb * 1024 * 1024);
  const sharedMode = Boolean(sharedApiUrl);
  const collapsedSidebar = sidebarCollapsed && !singleColumn;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    if (doc.querySelector('link[href*="Plus+Jakarta+Sans"]')) return;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
    doc.head.appendChild(link);
    const style = doc.createElement("style");
    style.textContent = "* { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; } ::selection { background: rgba(0,212,170,0.25); color: #f0f4fa; }";
    doc.head.appendChild(style);
  }, []);

  const activeDemoWorkspace = useMemo(
    () => demoWorkspaces.find((workspace) => workspace.summary.active) ?? demoWorkspaces[0] ?? null,
    [demoWorkspaces]
  );

  const workspaces = sharedMode ? remoteWorkspaces : demoWorkspaces.map((workspace) => workspace.summary);
  const tasks = sharedMode ? remoteTasks : activeDemoWorkspace?.tasks ?? [];
  const comments = sharedMode ? remoteComments : activeDemoWorkspace?.comments ?? [];
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.active) ?? workspaces[0] ?? null,
    [workspaces]
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const taskComments = useMemo(
    () => comments.filter((comment) => comment.taskId === selectedTaskId),
    [comments, selectedTaskId]
  );

  const noteComments = useMemo(
    () => taskComments.filter((comment) => comment.type !== "log"),
    [taskComments]
  );

  const logComments = useMemo(
    () => taskComments.filter((comment) => comment.type === "log"),
    [taskComments]
  );

  const visibleTasks = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    return sortTasks(tasks).filter((task) => {
      if (statusFilter !== "All" && task.status !== statusFilter) {
        return false;
      }
      if (assigneeFilter !== "All" && task.assignee !== assigneeFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        task.title.toLowerCase().includes(query) ||
        (task.contextLink ?? "").toLowerCase().includes(query)
      );
    });
  }, [assigneeFilter, statusFilter, taskQuery, tasks]);

  const blockedCount = useMemo(() => tasks.filter((task) => task.status === "Blocked").length, [tasks]);
  const humanQueueCount = useMemo(() => tasks.filter((task) => task.assignee === "Human").length, [tasks]);
  const aiQueueCount = useMemo(() => tasks.filter((task) => task.assignee === "AI").length, [tasks]);
  const autonomousQueueCount = useMemo(
    () => tasks.filter((task) => task.assignee === "AI" && task.executionMode === "Autonomous").length,
    [tasks]
  );

  const taskDraftDirty = useMemo(() => {
    if (!selectedTask) {
      return false;
    }
    return (
      taskDraft.title !== selectedTask.title ||
      taskDraft.status !== selectedTask.status ||
      taskDraft.createdBy !== selectedTask.createdBy ||
      taskDraft.assignee !== selectedTask.assignee ||
      taskDraft.executionMode !== selectedTask.executionMode ||
      taskDraft.aiUrgency !== (selectedTask.aiUrgency ?? 3) ||
      taskDraft.contextLink !== (selectedTask.contextLink ?? "")
    );
  }, [selectedTask, taskDraft]);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit): Promise<Record<string, unknown>> => {
      const res = await fetch(`${sharedApiUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {})
        }
      });

      const payload = (await res.json()) as Record<string, unknown>;
      if (!res.ok || payload.ok === false) {
        const message = String(payload.error ?? `API request failed (${res.status})`);
        throw new Error(message);
      }
      return payload;
    },
    [sharedApiUrl]
  );

  const applyWorkspacePayload = useCallback((payload: Record<string, unknown>) => {
    const nextWorkspaces = ((payload.workspaces as WireWorkspace[]) ?? []).map(toWorkspace);
    setRemoteWorkspaces(nextWorkspaces);
    return nextWorkspaces;
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    if (!sharedMode) {
      return [];
    }

    const payload = await apiRequest("/workspaces");
    return applyWorkspacePayload(payload);
  }, [apiRequest, applyWorkspacePayload, sharedMode]);

  const refreshTasks = useCallback(async () => {
    if (!sharedMode) {
      return [];
    }

    const payload = await apiRequest("/tasks");
    const nextTasks = ((payload.tasks as WireTask[]) ?? []).map(toTask);
    setRemoteTasks(nextTasks);
    return nextTasks;
  }, [apiRequest, sharedMode]);

  const refreshComments = useCallback(
    async (taskId: string) => {
      if (!sharedMode || !taskId) {
        return [];
      }

      const payload = await apiRequest(`/tasks/${taskId}/comments`);
      const nextComments = ((payload.comments as WireComment[]) ?? []).map(toComment);
      setRemoteComments(nextComments);
      return nextComments;
    },
    [apiRequest, sharedMode]
  );

  const refreshAll = useCallback(async () => {
    if (!sharedMode) {
      return;
    }

    setRefreshing(true);
    try {
      await refreshWorkspaces();
      await refreshTasks();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to refresh workspace data.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshTasks, refreshWorkspaces, sharedMode]);

  useEffect(() => {
    setSelectedTaskId((current) => {
      if (tasks.some((task) => task.id === current)) {
        return current;
      }
      return "";
    });
  }, [tasks]);

  useEffect(() => {
    setTaskDraft(createTaskDraft(selectedTask));
  }, [selectedTask]);

  useEffect(() => {
    setActivityView("comments");
    setExpandedLogIds([]);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!sharedMode) {
      return;
    }

    void refreshAll();
    const timer = setInterval(() => {
      void refreshAll();
    }, 10000);

    return () => clearInterval(timer);
  }, [refreshAll, sharedMode]);

  useEffect(() => {
    if (!sharedMode || !selectedTaskId) {
      return;
    }

    void refreshComments(selectedTaskId).catch((error) => {
      setApiError(error instanceof Error ? error.message : "Failed to load comments.");
    });
  }, [refreshComments, selectedTaskId, sharedMode]);

  const mutateDemoWorkspaces = useCallback(
    (updater: (current: DemoWorkspaceRecord[]) => DemoWorkspaceRecord[]) => {
      setDemoWorkspaces((current) => updater(current));
    },
    []
  );

  const switchWorkspace = useCallback(
    async (workspaceName: string) => {
      setSelectedTaskId("");
      setRemoteComments([]);

      if (!sharedMode) {
        mutateDemoWorkspaces((current) =>
          current.map((record) => ({
            ...record,
            summary: {
              ...record.summary,
              active: record.summary.name === workspaceName
            }
          }))
        );
        setApiError(null);
        return;
      }

      setWorkspaceBusy(true);
      try {
        const payload = await apiRequest("/workspaces/active", {
          method: "PATCH",
          body: JSON.stringify({ name: workspaceName })
        });
        applyWorkspacePayload(payload);
        await refreshTasks();
        setApiError(null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to switch workspace.");
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [apiRequest, applyWorkspacePayload, mutateDemoWorkspaces, refreshTasks, sharedMode]
  );

  const createWorkspace = useCallback(async () => {
    const name = workspaceDraft.trim();
    if (!name) {
      return;
    }

    if (!sharedMode) {
      const store = name.toLowerCase() === "default" ? ".data/store.json" : `.data/workspaces/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
      mutateDemoWorkspaces((current) => {
        const existing = current.find((workspace) => workspace.summary.name === name);
        if (existing) {
          return current.map((workspace) => ({
            ...workspace,
            summary: {
              ...workspace.summary,
              active: workspace.summary.name === name
            }
          }));
        }

        return [
          ...current.map((workspace) => ({
            ...workspace,
            summary: {
              ...workspace.summary,
              active: false
            }
          })),
          {
            summary: {
              name,
              provider: "local_json",
              store,
              active: true
            },
            tasks: [],
            comments: []
          }
        ];
      });
      setWorkspaceDraft("");
      setSelectedTaskId("");
      setShowWorkspaceCreator(false);
      setApiError(null);
      return;
    }

    setWorkspaceBusy(true);
    try {
      const payload = await apiRequest("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name,
          set_active: true
        })
      });
      applyWorkspacePayload(payload);
      setWorkspaceDraft("");
      setSelectedTaskId("");
      setRemoteComments([]);
      setShowWorkspaceCreator(false);
      await refreshTasks();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to create workspace.");
    } finally {
      setWorkspaceBusy(false);
    }
  }, [apiRequest, applyWorkspacePayload, mutateDemoWorkspaces, refreshTasks, sharedMode, workspaceDraft]);

  const deleteWorkspace = useCallback(
    async (workspaceName: string) => {
      if (!workspaceName) {
        return;
      }
      const removingActiveWorkspace = activeWorkspace?.name === workspaceName;

      if (!sharedMode) {
        if (demoWorkspaces.length <= 1) {
          setApiError("Cannot delete the last workspace.");
          return;
        }

        mutateDemoWorkspaces((current) => {
          const next = current.filter((workspace) => workspace.summary.name !== workspaceName);
          const hasActive = next.some((workspace) => workspace.summary.active);
          return next.map((workspace, index) => ({
            ...workspace,
            summary: {
              ...workspace.summary,
              active: hasActive ? workspace.summary.active : index === 0
            }
          }));
        });
        if (removingActiveWorkspace) {
          setSelectedTaskId("");
        }
        setWorkspaceDeleteTarget(null);
        setApiError(null);
        return;
      }

      setWorkspaceBusy(true);
      try {
        const payload = await apiRequest(`/workspaces/${encodeURIComponent(workspaceName)}`, {
          method: "DELETE"
        });
        applyWorkspacePayload(payload);
        if (removingActiveWorkspace) {
          setSelectedTaskId("");
          setRemoteComments([]);
        }
        setWorkspaceDeleteTarget(null);
        await refreshTasks();
        setApiError(null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to delete workspace.");
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [activeWorkspace?.name, apiRequest, applyWorkspacePayload, demoWorkspaces.length, mutateDemoWorkspaces, refreshTasks, sharedMode]
  );

  const deleteTask = useCallback(
    async (task: Task | null) => {
      if (!task || taskDeleting) {
        return;
      }

      if (!sharedMode) {
        mutateDemoWorkspaces((current) =>
          current.map((workspace) =>
            workspace.summary.active
              ? {
                  ...workspace,
                  tasks: workspace.tasks.filter((entry) => entry.id !== task.id),
                  comments: workspace.comments.filter((entry) => entry.taskId !== task.id),
                }
              : workspace
          )
        );
        setTaskDeleteTarget(null);
        setSelectedTaskId((current) => (current === task.id ? "" : current));
        setApiError(null);
        return;
      }

      setTaskDeleting(true);
      try {
        await apiRequest(`/tasks/${task.id}`, {
          method: "DELETE",
        });
        setRemoteTasks((current) => current.filter((entry) => entry.id !== task.id));
        setRemoteComments((current) => current.filter((entry) => entry.taskId !== task.id));
        setTaskDeleteTarget(null);
        setSelectedTaskId((current) => (current === task.id ? "" : current));
        setApiError(null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to delete task.");
      } finally {
        setTaskDeleting(false);
      }
    },
    [apiRequest, mutateDemoWorkspaces, sharedMode, taskDeleting]
  );

  const createTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) {
      return;
    }

    const now = new Date().toISOString();

    if (!sharedMode) {
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title,
        status: "Pending",
        createdBy: newCreatedBy,
        assignee: newAssignee,
        executionMode: newExecutionMode,
        contextLink: newContextLink.trim() || undefined,
        aiUrgency: newUrgency,
        inputRequest: null,
        inputResponse: null,
        updatedAt: now
      };

      mutateDemoWorkspaces((current) =>
        current.map((workspace) =>
          workspace.summary.active
            ? {
                ...workspace,
                tasks: [newTask, ...workspace.tasks]
              }
            : workspace
        )
      );
      setSelectedTaskId(newTask.id);
      setNewTitle("");
      setNewContextLink("");
      setNewUrgency(3);
      setShowCreateTask(false);
      setApiError(null);
      return;
    }

    setTaskCreating(true);
    try {
      const payload = await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          created_by: newCreatedBy,
          assignee: newAssignee,
          execution_mode: executionModeToWire(newExecutionMode),
          context_link: newContextLink.trim() || null,
          ai_urgency: newUrgency
        })
      });

      const created = toTask(payload.task as WireTask);
      setRemoteTasks((current) => [created, ...current]);
      setSelectedTaskId(created.id);
      setNewTitle("");
      setNewContextLink("");
      setNewUrgency(3);
      setShowCreateTask(false);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to create task.");
    } finally {
      setTaskCreating(false);
    }
  }, [
    apiRequest,
    mutateDemoWorkspaces,
    newAssignee,
    newContextLink,
    newCreatedBy,
    newExecutionMode,
    newTitle,
    newUrgency,
    sharedMode
  ]);

  const updateTaskStatus = useCallback(async (task: Task, nextStatus: TaskStatus) => {
    if (statusUpdatingTaskId === task.id || task.status === nextStatus) {
      return;
    }

    const now = new Date().toISOString();

    if (!sharedMode) {
      mutateDemoWorkspaces((current) =>
        current.map((workspace) =>
          workspace.summary.active
            ? {
                ...workspace,
                tasks: workspace.tasks.map((entry) =>
                  entry.id === task.id
                    ? {
                        ...entry,
                        status: nextStatus,
                        updatedAt: now
                      }
                    : entry
                )
              }
            : workspace
        )
      );
      setApiError(null);
      return;
    }

    setStatusUpdatingTaskId(task.id);
    try {
      const payload = await apiRequest(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: statusToWire(nextStatus)
        })
      });
      const updated = toTask(payload.task as WireTask);
      setRemoteTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to update task status.");
    } finally {
      setStatusUpdatingTaskId("");
    }
  }, [apiRequest, mutateDemoWorkspaces, sharedMode, statusUpdatingTaskId]);

  const saveTaskConfig = useCallback(async () => {
    if (!selectedTask || taskSaving || !taskDraftDirty) {
      return;
    }

    const patch = {
      title: taskDraft.title.trim(),
      status: statusToWire(taskDraft.status),
      created_by: taskDraft.createdBy,
      assignee: taskDraft.assignee,
      execution_mode: executionModeToWire(taskDraft.executionMode),
      ai_urgency: taskDraft.aiUrgency,
      context_link: taskDraft.contextLink.trim() || null
    };

    if (!patch.title) {
      setApiError("Task title cannot be empty.");
      return;
    }

    if (!sharedMode) {
      mutateDemoWorkspaces((current) =>
        current.map((workspace) =>
          workspace.summary.active
            ? {
                ...workspace,
                tasks: workspace.tasks.map((task) =>
                  task.id === selectedTask.id
                    ? {
                        ...task,
                        title: patch.title,
                        status: taskDraft.status,
                        createdBy: taskDraft.createdBy,
                        assignee: taskDraft.assignee,
                        executionMode: taskDraft.executionMode,
                        aiUrgency: taskDraft.aiUrgency,
                        contextLink: taskDraft.contextLink.trim() || undefined,
                        updatedAt: new Date().toISOString()
                      }
                    : task
                )
              }
            : workspace
        )
      );
      setApiError(null);
      return;
    }

    setTaskSaving(true);
    try {
      const payload = await apiRequest(`/tasks/${selectedTask.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      const updated = toTask(payload.task as WireTask);
      setRemoteTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to save task configuration.");
    } finally {
      setTaskSaving(false);
    }
  }, [apiRequest, mutateDemoWorkspaces, selectedTask, sharedMode, taskDraft, taskDraftDirty, taskSaving]);

  const resolveInput = useCallback(
    async (responsePayload: Record<string, unknown>) => {
      if (!selectedTask) {
        return;
      }

      const now = new Date().toISOString();
      const decisionMessage = `Unblocked AI with response: ${JSON.stringify(responsePayload)}`;

      if (!sharedMode) {
        mutateDemoWorkspaces((current) =>
          current.map((workspace) =>
            workspace.summary.active
              ? {
                  ...workspace,
                  tasks: workspace.tasks.map((task) =>
                    task.id === selectedTask.id
                      ? {
                          ...task,
                          status: "In Progress",
                          inputRequest: null,
                          inputResponse: responsePayload,
                          assignee: "AI",
                          updatedAt: now
                        }
                      : task
                  ),
                  comments: [
                    {
                      id: `c-${Date.now()}`,
                      taskId: selectedTask.id,
                      author: "Human",
                      type: "decision",
                      message: decisionMessage,
                      timestamp: now
                    },
                    ...workspace.comments
                  ]
                }
              : workspace
          )
        );
        return;
      }

      try {
        await apiRequest(`/tasks/${selectedTask.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "in_progress",
            assignee: "AI",
            input_request: null,
            input_response: responsePayload
          })
        });

        await apiRequest(`/tasks/${selectedTask.id}/comments`, {
          method: "POST",
          body: JSON.stringify({
            author: "Human",
            type: "decision",
            message: decisionMessage
          })
        });

        await refreshTasks();
        await refreshComments(selectedTask.id);
        setApiError(null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to resolve blocker.");
      }
    },
    [apiRequest, mutateDemoWorkspaces, refreshComments, refreshTasks, selectedTask, sharedMode]
  );

  const attachFile = useCallback(async () => {
    const picked = await pickFileForUpload();
    if (!picked) {
      return;
    }

    if (picked.size_bytes > uploadLimitBytes) {
      setUploadDraft(null);
      setUploadError(`File is larger than ${uploadLimitMb} MB.`);
      return;
    }

    setUploadError(null);
    setUploadDraft(picked);
  }, [uploadLimitBytes, uploadLimitMb]);

  const addComment = useCallback(async () => {
    if (!selectedTask || commentSubmitting) {
      return;
    }

    const rawMessage = commentDraft.trim();
    const fallbackMessage = uploadDraft ? `Attached file: ${uploadDraft.filename}` : "";
    const message = rawMessage || fallbackMessage;
    if (!message) {
      return;
    }

    setCommentSubmitting(true);
    const now = new Date().toISOString();

    if (!sharedMode) {
      mutateDemoWorkspaces((current) =>
        current.map((workspace) =>
          workspace.summary.active
            ? {
                ...workspace,
                comments: [
                  {
                    id: `c-${Date.now()}`,
                    taskId: selectedTask.id,
                    author: "Human",
                    type: uploadDraft ? "attachment" : "message",
                    message,
                    timestamp: now,
                    attachmentMeta: uploadDraft
                      ? {
                          kind: uploadDraft.mime_type.startsWith("image/")
                            ? "image"
                            : uploadDraft.mime_type.startsWith("video/")
                              ? "video"
                              : uploadDraft.filename.toLowerCase().endsWith(".csv")
                                ? "csv"
                                : uploadDraft.mime_type.startsWith("text/")
                                  ? "text"
                                  : "file",
                          filename: uploadDraft.filename,
                          mime_type: uploadDraft.mime_type,
                          size_bytes: uploadDraft.size_bytes
                        }
                      : undefined
                  },
                  ...workspace.comments
                ]
              }
            : workspace
        )
      );
      setCommentDraft("");
      setUploadDraft(null);
      setUploadError(null);
      setCommentSubmitting(false);
      return;
    }

    try {
      let attachmentLink: string | null = null;
      let attachmentMeta: Record<string, unknown> | null = null;
      let type = "message";

      if (uploadDraft) {
        const uploaded = await apiRequest("/files", {
          method: "POST",
          body: JSON.stringify({
            task_id: selectedTask.id,
            filename: uploadDraft.filename,
            mime_type: uploadDraft.mime_type,
            data_base64: uploadDraft.data_base64
          })
        });

        attachmentMeta = (uploaded.file as Record<string, unknown>) ?? null;
        attachmentLink = String(attachmentMeta?.download_link ?? "");
        type = "attachment";
      }

      await apiRequest(`/tasks/${selectedTask.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          author: "Human",
          message,
          type,
          attachment_link: attachmentLink,
          metadata: attachmentMeta
        })
      });

      setCommentDraft("");
      setUploadDraft(null);
      setUploadError(null);
      await refreshComments(selectedTask.id);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to add comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }, [apiRequest, commentDraft, commentSubmitting, mutateDemoWorkspaces, refreshComments, selectedTask, sharedMode, uploadDraft]);

  const openLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setApiError(`Could not open link: ${url}`);
    }
  }, []);

  const closeTaskDrawer = useCallback(() => {
    setTaskDeleteTarget(null);
    setSelectedTaskId("");
  }, []);

  const toggleLogPayload = useCallback((commentId: string) => {
    setExpandedLogIds((current) =>
      current.includes(commentId) ? current.filter((id) => id !== commentId) : [...current, commentId]
    );
  }, []);

  const selectedTaskContextValue = taskDraft.contextLink.trim();
  const selectedTaskContextIsUrl = looksLikeUrl(selectedTaskContextValue);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.workspaceBg}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {apiError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{apiError}</Text>
            </View>
          ) : null}

          <View style={[styles.workspaceShell, singleColumn ? styles.workspaceShellSingle : null]}>
            <View
              style={[
                styles.sidebarPanel,
                singleColumn ? styles.sidebarPanelSingle : null,
                collapsedSidebar ? styles.sidebarPanelCollapsed : null
              ]}
            >
              <View style={styles.sidebarTopRow}>
                <View style={styles.accountRow}>
                  <LogoMark />
                  {!collapsedSidebar ? (
                    <View style={styles.accountCopy}>
                      <Text style={styles.accountName}>Concentray</Text>
                      <Text style={styles.accountSubtle}>{sharedMode ? "Shared workspace" : "Demo workspace"}</Text>
                    </View>
                  ) : null}
                </View>

                <Pressable style={styles.iconButton} onPress={() => setSidebarCollapsed((current) => !current)}>
                  <Feather name={collapsedSidebar ? "chevrons-right" : "chevrons-left"} size={15} color="#526080" />
                </Pressable>
              </View>

              <View style={styles.sidebarActionStack}>
                <Pressable style={styles.sidebarPrimaryAction} onPress={() => setShowCreateTask(true)}>
                  <Feather name="plus-circle" size={15} color="#00d4aa" />
                  {!collapsedSidebar ? <Text style={styles.sidebarPrimaryActionText}>Add task</Text> : null}
                </Pressable>
                <Pressable style={styles.sidebarSecondaryAction} onPress={() => setShowWorkspaceCreator(true)}>
                  <Feather name="folder-plus" size={15} color="#8494b2" />
                  {!collapsedSidebar ? <Text style={styles.sidebarSecondaryActionText}>Add workspace</Text> : null}
                </Pressable>
              </View>

              {!collapsedSidebar ? <Text style={styles.sidebarSectionTitle}>Workspaces</Text> : null}
              <View style={styles.workspaceStack}>
                {workspaces.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.name}
                    workspace={workspace}
                    isSelected={workspace.active}
                    collapsed={collapsedSidebar}
                    canDelete={workspaces.length > 1}
                    busy={workspaceBusy}
                    onPress={() => void switchWorkspace(workspace.name)}
                    onDelete={() => setWorkspaceDeleteTarget(workspace)}
                  />
                ))}
              </View>
            </View>

              <View style={styles.mainPanel}>
                <View style={styles.mainPanelHeader}>
                  <View style={styles.mainHeaderCopy}>
                    <Text style={styles.mainBreadcrumb}>{sharedMode ? "Shared local API" : "Local workspace"}</Text>
                    <Text style={styles.mainPanelTitle}>{activeWorkspace?.name ?? "No workspace"}</Text>
                    <View style={styles.headerStats}>
                      <View style={styles.headerStat}>
                        <Text style={styles.headerStatValue}>{visibleTasks.length}</Text>
                        <Text style={styles.headerStatLabel}>visible</Text>
                      </View>
                      <View style={styles.headerStat}>
                        <Text style={styles.headerStatValue}>{humanQueueCount}</Text>
                        <Text style={styles.headerStatLabel}>human</Text>
                      </View>
                      <View style={styles.headerStat}>
                        <Text style={styles.headerStatValue}>{aiQueueCount}</Text>
                        <Text style={styles.headerStatLabel}>ai</Text>
                      </View>
                      <View style={styles.headerStat}>
                        <Text style={styles.headerStatValue}>{autonomousQueueCount}</Text>
                        <Text style={styles.headerStatLabel}>auto</Text>
                      </View>
                      <View style={styles.headerStat}>
                        <Text style={styles.headerStatValue}>{blockedCount}</Text>
                        <Text style={styles.headerStatLabel}>blocked</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.mainHeaderActions}>
                    <Pressable style={styles.toolbarButton} onPress={() => setShowQueueFilters((current) => !current)}>
                      <Feather name="sliders" size={13} color="#8494b2" />
                      <Text style={styles.toolbarButtonText}>{showQueueFilters ? "Hide filters" : "Filters"}</Text>
                    </Pressable>
                    <Pressable style={styles.toolbarButton} onPress={() => void refreshAll()} disabled={refreshing || !sharedMode}>
                      <Feather name="rotate-cw" size={13} color="#8494b2" />
                      <Text style={styles.toolbarButtonText}>{refreshing ? "Syncing" : "Sync"}</Text>
                    </Pressable>
                  </View>
                </View>

              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={taskQuery}
                  onChangeText={setTaskQuery}
                  placeholder="Search tasks"
                  placeholderTextColor="#3d4b68"
                />
              </View>

              {showQueueFilters ? (
                <View style={styles.filterBar}>
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Status</Text>
                    <View style={styles.filterWrap}>
                      {["All", "Pending", "In Progress", "Blocked", "Done"].map((option) => (
                        <FilterChip
                          key={option}
                          label={option}
                          active={statusFilter === option}
                          onPress={() => setStatusFilter(option as "All" | TaskStatus)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Assignee</Text>
                    <View style={styles.filterWrap}>
                      {["All", "Human", "AI"].map((option) => (
                        <FilterChip
                          key={option}
                          label={option}
                          active={assigneeFilter === option}
                          onPress={() => setAssigneeFilter(option as "All" | Actor)}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.contentSplit}>
                <View style={styles.taskListPane}>
                  {visibleTasks.length ? (
                    visibleTasks.map((task) => (
                      <TaskListItem
                        key={task.id}
                        task={task}
                        selected={task.id === selectedTaskId}
                        busy={statusUpdatingTaskId === task.id}
                        onPress={() => setSelectedTaskId(task.id)}
                        onToggleDone={() => void updateTaskStatus(task, task.status === "Done" ? "Pending" : "Done")}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyStateCardCompact}>
                      <Text style={styles.emptyStateText}>No tasks yet. Create one from the sidebar.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          <Modal
            visible={Boolean(selectedTask)}
            transparent
            animationType={singleColumn ? "slide" : "fade"}
            onRequestClose={closeTaskDrawer}
          >
            <View style={styles.drawerScrim}>
              <Pressable style={styles.drawerBackdrop} onPress={closeTaskDrawer} />
              {selectedTask ? (
                <View style={[styles.drawerPanel, singleColumn ? styles.drawerPanelMobile : null]}>
                  <View style={styles.drawerHeader}>
                    <View style={styles.drawerHeaderTrail}>
                      <Text style={styles.drawerWorkspaceLabel}>{activeWorkspace?.name ?? "Workspace"}</Text>
                      <Text style={styles.drawerWorkspaceDot}>/</Text>
                      <Text style={styles.drawerWorkspaceMeta}>Task</Text>
                    </View>
                    <View style={styles.drawerHeaderActions}>
                      <Pressable
                        style={[styles.summaryActionPill, statusUpdatingTaskId === selectedTask.id ? styles.buttonDisabled : null]}
                        onPress={() => void updateTaskStatus(selectedTask, selectedTask.status === "Done" ? "Pending" : "Done")}
                        disabled={statusUpdatingTaskId === selectedTask.id}
                      >
                        <Feather name={selectedTask.status === "Done" ? "rotate-ccw" : "check"} size={13} color="#8494b2" />
                        <Text style={styles.summaryActionPillText}>
                          {statusUpdatingTaskId === selectedTask.id ? "..." : selectedTask.status === "Done" ? "Reopen" : "Done"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.iconButton, taskDeleting ? styles.buttonDisabled : null]}
                        onPress={() => setTaskDeleteTarget(selectedTask)}
                        disabled={taskDeleting}
                      >
                        <Feather name="trash-2" size={13} color="#fda4af" />
                      </Pressable>
                      <Pressable style={styles.iconButton} onPress={closeTaskDrawer}>
                        <Feather name="x" size={15} color="#526080" />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.taskWorkspaceMain}>
                    <ScrollView style={styles.taskWorkspaceMainScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
                      <TextInput
                        style={styles.drawerTitleInput}
                        value={taskDraft.title}
                        onChangeText={(value) => setTaskDraft((current) => ({ ...current, title: value }))}
                        placeholder="Task title"
                        placeholderTextColor="#3d4b68"
                        multiline
                      />

                      <View style={styles.metaGrid}>
                        <Pressable
                          style={styles.metaCellTappable}
                          onPress={() => {
                            const order: TaskStatus[] = ["Pending", "In Progress", "Blocked", "Done"];
                            const next = order[(order.indexOf(taskDraft.status) + 1) % order.length];
                            setTaskDraft((c) => ({ ...c, status: next }));
                          }}
                        >
                          <Text style={styles.metaCellLabel}>Status</Text>
                          <View style={[styles.metaStatusDot, statusBarStyle(taskDraft.status)]} />
                          <Text style={styles.metaCellValue}>{taskDraft.status}</Text>
                          <Feather name="chevron-right" size={10} color="#3d4b68" />
                        </Pressable>
                        <Pressable
                          style={styles.metaCellTappable}
                          onPress={() => {
                            const next = taskDraft.assignee === "Human" ? "AI" : "Human";
                            setTaskDraft((c) => ({ ...c, assignee: next as Actor }));
                          }}
                        >
                          <Text style={styles.metaCellLabel}>Assignee</Text>
                          <Feather name={taskDraft.assignee === "AI" ? "cpu" : "user"} size={11} color="#8494b2" />
                          <Text style={styles.metaCellValue}>{taskDraft.assignee}</Text>
                          <Feather name="chevron-right" size={10} color="#3d4b68" />
                        </Pressable>
                        <Pressable
                          style={styles.metaCellTappable}
                          onPress={() => {
                            const next = taskDraft.executionMode === "Autonomous" ? "Session" : "Autonomous";
                            setTaskDraft((c) => ({ ...c, executionMode: next }));
                          }}
                        >
                          <Text style={styles.metaCellLabel}>Run mode</Text>
                          <Feather name={taskDraft.executionMode === "Autonomous" ? "zap" : "message-square"} size={11} color="#8494b2" />
                          <Text style={styles.metaCellValue}>{taskDraft.executionMode}</Text>
                          <Feather name="chevron-right" size={10} color="#3d4b68" />
                        </Pressable>
                        <View style={styles.metaCell}>
                          <Text style={styles.metaCellLabel}>Created by</Text>
                          <Text style={styles.metaCellValueMuted}>{selectedTask.createdBy}</Text>
                        </View>
                        <View style={styles.metaCell}>
                          <Text style={styles.metaCellLabel}>Urgency</Text>
                          <Text style={styles.metaCellValueMuted}>{selectedTask.aiUrgency ?? 3}/5</Text>
                        </View>
                        <View style={styles.metaCell}>
                          <Text style={styles.metaCellLabel}>Updated</Text>
                          <Text style={styles.metaCellValueMono}>{formatTimestamp(selectedTask.updatedAt)}</Text>
                        </View>
                        {selectedTask.workerId ? (
                          <View style={styles.metaCell}>
                            <Text style={styles.metaCellLabel}>Worker</Text>
                            <Text style={styles.metaCellValueMono}>{selectedTask.workerId}</Text>
                          </View>
                        ) : null}
                      </View>
                      {taskDraftDirty ? (
                        <View style={styles.inlineSaveRow}>
                          <Pressable
                            style={styles.quietButton}
                            onPress={() => setTaskDraft(createTaskDraft(selectedTask))}
                          >
                            <Text style={styles.quietButtonText}>Reset</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.primaryButtonSmall, taskSaving ? styles.buttonDisabled : null]}
                            onPress={() => void saveTaskConfig()}
                            disabled={taskSaving}
                          >
                            <Text style={styles.primaryButtonText}>{taskSaving ? "Saving..." : "Save"}</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <View style={styles.contextRow}>
                        <Feather name="link" size={13} color="#3d4b68" />
                        <TextInput
                          style={styles.contextInput}
                          value={taskDraft.contextLink}
                          onChangeText={(value) => setTaskDraft((current) => ({ ...current, contextLink: value }))}
                          placeholder="Context note or URL"
                          placeholderTextColor="#3d4b68"
                        />
                        {selectedTaskContextIsUrl ? (
                          <Pressable style={styles.contextOpenBtn} onPress={() => void openLink(selectedTaskContextValue)}>
                            <Feather name="external-link" size={12} color="#5df5d0" />
                          </Pressable>
                        ) : null}
                      </View>

                      {selectedTask.status === "Blocked" && selectedTask.inputRequest ? (
                        <View style={styles.blockerShell}>
                          <BlockerCard inputRequest={selectedTask.inputRequest} onSubmit={(payload) => { void resolveInput(payload); }} />
                        </View>
                      ) : null}

                      <View style={styles.activityDivider}>
                        <View style={styles.activityTabs}>
                          <Pressable style={[styles.activityTab, activityView === "comments" ? styles.activityTabActive : null]} onPress={() => setActivityView("comments")}>
                            <Text style={[styles.activityTabText, activityView === "comments" ? styles.activityTabTextActive : null]}>Comments</Text>
                            <Text style={[styles.activityTabCount, activityView === "comments" ? styles.activityTabCountActive : null]}>{noteComments.length}</Text>
                          </Pressable>
                          <Pressable style={[styles.activityTab, activityView === "logs" ? styles.activityTabActive : null]} onPress={() => setActivityView("logs")}>
                            <Text style={[styles.activityTabText, activityView === "logs" ? styles.activityTabTextActive : null]}>Logs</Text>
                            <Text style={[styles.activityTabCount, activityView === "logs" ? styles.activityTabCountActive : null]}>{logComments.length}</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.commentStack}>
                        {(activityView === "comments" ? noteComments : logComments).length ? (
                          (activityView === "comments" ? noteComments : logComments).map((comment) => {
                            const rawMetadata = formatMetadataJson(comment.metadata);
                            const showPayload = expandedLogIds.includes(comment.id);
                            return (
                              <View key={comment.id} style={styles.commentCard}>
                                <View style={styles.commentHeader}>
                                  <View style={[styles.authorBadge, comment.author === "AI" ? styles.authorBadgeAi : styles.authorBadgeHuman]}>
                                    <Text style={styles.authorBadgeText}>{comment.author}</Text>
                                  </View>
                                  <Text style={styles.commentType}>{comment.type}</Text>
                                  <Text style={styles.commentTimestamp}>{formatTimestamp(comment.timestamp)}</Text>
                                </View>
                                <Text style={styles.commentBody}>{comment.message}</Text>
                                {comment.attachmentLink ? (
                                  <View style={styles.attachmentCard}>
                                    <View style={styles.attachmentHeader}>
                                      <Text style={styles.attachmentTitle}>{comment.attachmentMeta?.filename ?? comment.attachmentLink}</Text>
                                      <Text style={styles.attachmentMeta}>{formatBytes(comment.attachmentMeta?.size_bytes)}</Text>
                                    </View>
                                    {comment.attachmentMeta?.kind === "image" ? <Image source={{ uri: comment.attachmentLink }} style={styles.attachmentImage as ImageStyle} /> : null}
                                    {comment.attachmentMeta?.kind === "video" ? <AttachmentVideoPreview uri={comment.attachmentLink} mimeType={comment.attachmentMeta?.mime_type} /> : null}
                                    {comment.attachmentMeta?.preview_text ? <View style={styles.previewCard}><Text style={styles.previewText}>{comment.attachmentMeta.preview_text}</Text></View> : null}
                                    <Pressable style={styles.attachmentOpenBtn} onPress={() => void openLink(comment.attachmentLink ?? "")}>
                                      <Feather name="external-link" size={12} color="#8494b2" />
                                      <Text style={styles.attachmentOpenText}>Open</Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                                {activityView === "logs" && rawMetadata ? (
                                  <View style={styles.logPayloadCard}>
                                    <Pressable style={styles.logPayloadToggle} onPress={() => toggleLogPayload(comment.id)}>
                                      <Feather name={showPayload ? "chevron-up" : "chevron-down"} size={12} color="#526080" />
                                      <Text style={styles.quietButtonText}>{showPayload ? "Hide payload" : "Show payload"}</Text>
                                    </Pressable>
                                    {showPayload ? <Text style={styles.logPayloadText}>{rawMetadata}</Text> : null}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })
                        ) : (
                          <View style={styles.emptyStateCard}>
                            <Text style={styles.emptyStateText}>{activityView === "comments" ? "No comments yet." : "No logs yet."}</Text>
                          </View>
                        )}
                      </View>
                    </ScrollView>

                    {activityView === "comments" ? (
                      <View style={styles.composerDock}>
                        {uploadDraft ? <Text style={styles.uploadHint}>{uploadDraft.filename} ({formatBytes(uploadDraft.size_bytes)})</Text> : null}
                        {uploadError ? <Text style={styles.inlineError}>{uploadError}</Text> : null}
                        <View style={styles.composerDockRow}>
                          <View style={styles.composerInputShell}>
                            <TextInput style={styles.composerInput} value={commentDraft} onChangeText={setCommentDraft} placeholder="Write a comment..." placeholderTextColor="#3d4b68" multiline />
                            <View style={styles.composerActions}>
                              <Pressable style={styles.composerIconButton} onPress={() => void attachFile()}><Feather name="paperclip" size={14} color="#526080" /></Pressable>
                              <Pressable style={[styles.composerSubmitButton, commentSubmitting ? styles.buttonDisabled : null]} onPress={() => void addComment()} disabled={commentSubmitting}><Feather name="arrow-up" size={14} color="#f0f4fa" /></Pressable>
                            </View>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.composerDockMuted}>
                        <Text style={styles.composerDockMutedText}>Switch to Comments to add notes.</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          </Modal>

          <Modal visible={showCreateTask} transparent animationType="fade" onRequestClose={() => setShowCreateTask(false)}>
            <View style={styles.modalScrim}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>New Task</Text>
                    <Text style={styles.modalSubtle}>Create in {activeWorkspace?.name ?? "current workspace"}</Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => setShowCreateTask(false)}>
                    <Feather name="x" size={15} color="#526080" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <TextInput
                    style={styles.modalTitleInput}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Task name"
                    placeholderTextColor="#3d4b68"
                  />
                  <TextInput
                    style={styles.modalTextInput}
                    value={newContextLink}
                    onChangeText={setNewContextLink}
                    placeholder="Context link or description"
                    placeholderTextColor="#3d4b68"
                  />

                  <View style={styles.modalChoiceRow}>
                    <ChoiceGroup
                      label="Created By"
                      value={newCreatedBy}
                      onChange={(value) => setNewCreatedBy(value as Actor)}
                      options={[
                        { label: "Human", value: "Human" },
                        { label: "AI", value: "AI" }
                      ]}
                    />
                    <ChoiceGroup
                      label="Assignee"
                      value={newAssignee}
                      onChange={(value) => setNewAssignee(value as Actor)}
                      options={[
                        { label: "Human", value: "Human" },
                        { label: "AI", value: "AI" }
                      ]}
                    />
                    <ChoiceGroup
                      label="Run Mode"
                      value={newExecutionMode}
                      onChange={(value) => setNewExecutionMode(value as TaskExecutionMode)}
                      options={[
                        { label: "Autonomous", value: "Autonomous" },
                        { label: "Session", value: "Session" }
                      ]}
                    />
                    <ChoiceGroup
                      label="Urgency"
                      value={String(newUrgency)}
                      onChange={(value) => setNewUrgency(Number(value))}
                      options={[1, 2, 3, 4, 5].map((value) => ({ label: `${value}`, value: String(value) }))}
                    />
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable style={styles.modalGhostButton} onPress={() => setShowCreateTask(false)}>
                    <Text style={styles.modalGhostButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalPrimaryButton, taskCreating ? styles.buttonDisabled : null]}
                    onPress={() => void createTask()}
                    disabled={taskCreating}
                  >
                    <Text style={styles.modalPrimaryButtonText}>{taskCreating ? "Creating..." : "Add task"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={showWorkspaceCreator} transparent animationType="fade" onRequestClose={() => setShowWorkspaceCreator(false)}>
            <View style={styles.modalScrim}>
              <View style={styles.modalCardSmall}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>New Workspace</Text>
                    <Text style={styles.modalSubtle}>Create a separate lane for a different area of work.</Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => setShowWorkspaceCreator(false)}>
                    <Feather name="x" size={15} color="#526080" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <TextInput
                    style={styles.modalTextInput}
                    value={workspaceDraft}
                    onChangeText={setWorkspaceDraft}
                    placeholder="Workspace name"
                    placeholderTextColor="#3d4b68"
                  />
                </View>

                <View style={styles.modalFooter}>
                  <Pressable style={styles.modalGhostButton} onPress={() => setShowWorkspaceCreator(false)}>
                    <Text style={styles.modalGhostButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalPrimaryButton, workspaceBusy ? styles.buttonDisabled : null]}
                    onPress={() => void createWorkspace()}
                    disabled={workspaceBusy}
                  >
                    <Text style={styles.modalPrimaryButtonText}>{workspaceBusy ? "Creating..." : "Add workspace"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={Boolean(taskDeleteTarget)}
            transparent
            animationType="fade"
            onRequestClose={() => setTaskDeleteTarget(null)}
          >
            <View style={styles.modalScrim}>
              <View style={styles.modalCardSmall}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Delete Task</Text>
                    <Text style={styles.modalSubtle}>This removes the task from the active queue and hides its thread.</Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => setTaskDeleteTarget(null)}>
                    <Feather name="x" size={15} color="#526080" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.deleteConfirmText}>
                    Delete <Text style={styles.deleteConfirmStrong}>{taskDeleteTarget?.title}</Text>?
                  </Text>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable style={styles.modalGhostButton} onPress={() => setTaskDeleteTarget(null)}>
                    <Text style={styles.modalGhostButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalDangerButton, taskDeleting ? styles.buttonDisabled : null]}
                    onPress={() => void deleteTask(taskDeleteTarget)}
                    disabled={taskDeleting}
                  >
                    <Text style={styles.modalDangerButtonText}>{taskDeleting ? "Deleting..." : "Delete task"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={Boolean(workspaceDeleteTarget)}
            transparent
            animationType="fade"
            onRequestClose={() => setWorkspaceDeleteTarget(null)}
          >
            <View style={styles.modalScrim}>
              <View style={styles.modalCardSmall}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Delete Workspace</Text>
                    <Text style={styles.modalSubtle}>This only removes the workspace from Concentray. The store file stays on disk.</Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => setWorkspaceDeleteTarget(null)}>
                    <Feather name="x" size={15} color="#526080" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.deleteConfirmText}>
                    Remove <Text style={styles.deleteConfirmStrong}>{workspaceDeleteTarget?.name}</Text> from the workspace list?
                  </Text>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable style={styles.modalGhostButton} onPress={() => setWorkspaceDeleteTarget(null)}>
                    <Text style={styles.modalGhostButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalDangerButton, workspaceBusy ? styles.buttonDisabled : null]}
                    onPress={() => void deleteWorkspace(workspaceDeleteTarget?.name ?? "")}
                    disabled={workspaceBusy}
                  >
                    <Text style={styles.modalDangerButtonText}>{workspaceBusy ? "Deleting..." : "Delete workspace"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const F = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FM = '"JetBrains Mono", "SF Mono", Menlo, monospace';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#060810"
  },
  workspaceBg: {
    flex: 1,
    backgroundColor: "#060810"
  },
  container: {
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12
  },
  errorBanner: {
    borderRadius: 10,
    backgroundColor: "rgba(244, 63, 94, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.22)",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  errorBannerText: {
    color: "#fda4af",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: F
  },
  workspaceShell: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 820,
    backgroundColor: "#0c0f18",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    overflow: "hidden"
  },
  workspaceShellSingle: {
    flexDirection: "column"
  },
  sidebarPanel: {
    width: 272,
    backgroundColor: "#080b13",
    borderRightWidth: 1,
    borderRightColor: "rgba(99,130,190,0.08)",
    padding: 16,
    gap: 20
  },
  sidebarPanelSingle: {
    width: "100%"
  },
  sidebarPanelCollapsed: {
    width: 68,
    paddingHorizontal: 10
  },
  sidebarTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0
  },
  accountCopy: {
    gap: 1,
    minWidth: 0
  },
  accountName: {
    color: "#f0f4fa",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    fontFamily: F
  },
  accountSubtle: {
    color: "#526080",
    fontSize: 11,
    fontFamily: F
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(99,130,190,0.06)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    alignItems: "center",
    justifyContent: "center"
  },
  sidebarActionStack: {
    gap: 6
  },
  sidebarPrimaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,212,170,0.07)",
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  sidebarPrimaryActionText: {
    color: "#5df5d0",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: F
  },
  sidebarSecondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    backgroundColor: "rgba(99,130,190,0.05)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  sidebarSecondaryActionText: {
    color: "#8494b2",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: F
  },
  sidebarSectionTitle: {
    color: "#3d4b68",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: F
  },
  workspaceStack: {
    gap: 3
  },
  workspaceName: {
    color: "#dce4f0",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: F
  },
  workspaceStore: {
    color: "#3d4b68",
    fontSize: 11,
    fontFamily: F
  },
  workspaceDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,130,190,0.05)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)"
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
    padding: 24,
    gap: 16
  },
  mainPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99,130,190,0.08)"
  },
  mainHeaderCopy: {
    gap: 6
  },
  mainBreadcrumb: {
    color: "#3d4b68",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: F
  },
  mainPanelTitle: {
    color: "#f0f4fa",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: F
  },
  headerStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  headerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 6,
    backgroundColor: "rgba(99,130,190,0.05)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  headerStatValue: {
    color: "#dce4f0",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FM
  },
  headerStatLabel: {
    color: "#3d4b68",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: F
  },
  mainHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "rgba(99,130,190,0.06)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  toolbarButtonText: {
    color: "#8494b2",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: F
  },
  searchRow: {
    flexDirection: "row",
    paddingTop: 2
  },
  searchInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    color: "#dce4f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: F
  },
  filterBar: {
    gap: 12,
    borderRadius: 10,
    backgroundColor: "rgba(99,130,190,0.04)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    padding: 14
  },
  filterSection: {
    gap: 8
  },
  filterLabel: {
    color: "#3d4b68",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: F
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  contentSplit: {
    flex: 1,
    minHeight: 0
  },
  detailBody: {
    padding: 20,
    gap: 14
  },
  taskListPane: {
    gap: 2,
    minWidth: 0,
    paddingBottom: 12
  },
  statusBarPending: {
    backgroundColor: "rgba(91,141,239,0.40)"
  },
  statusBarInProgress: {
    backgroundColor: "#00d4aa"
  },
  statusBarBlocked: {
    backgroundColor: "#f43f5e"
  },
  statusBarDone: {
    backgroundColor: "rgba(99,130,190,0.15)"
  },
  statusPending: {
    backgroundColor: "transparent"
  },
  statusInProgress: {
    backgroundColor: "rgba(0,212,170,0.70)",
    borderColor: "rgba(0,212,170,0.80)"
  },
  statusBlocked: {
    backgroundColor: "rgba(244,63,94,0.75)",
    borderColor: "rgba(244,63,94,0.85)"
  },
  statusDone: {
    backgroundColor: "rgba(107, 114, 128, 0.75)",
    borderColor: "rgba(156, 163, 175, 0.85)"
  },
  emptyStateCardCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(99,130,190,0.03)",
    padding: 20,
    gap: 6
  },
  drawerScrim: {
    flex: 1,
    backgroundColor: "rgba(3, 4, 8, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  drawerPanel: {
    width: "100%",
    maxWidth: 1380,
    height: "90%",
    maxHeight: 960,
    backgroundColor: "#0c0f18",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24
  },
  drawerPanelMobile: {
    maxWidth: "100%",
    height: "100%",
    maxHeight: "100%",
    borderRadius: 0,
    borderWidth: 0
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99,130,190,0.08)",
    backgroundColor: "#080b13"
  },
  drawerHeaderTrail: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0
  },
  drawerWorkspaceLabel: {
    color: "#3d4b68",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: F
  },
  drawerWorkspaceDot: {
    color: "#2a3550",
    fontSize: 13,
    fontWeight: "700"
  },
  drawerWorkspaceMeta: {
    color: "#8494b2",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: F
  },
  drawerHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  drawerTitleInput: {
    color: "#f0f4fa",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    textAlignVertical: "top"
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    borderRadius: 10,
    backgroundColor: "rgba(99,130,190,0.03)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.06)",
    padding: 4
  },
  metaCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "rgba(99,130,190,0.04)"
  },
  metaCellTappable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "rgba(0,212,170,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.12)"
  },
  metaCellLabel: {
    color: "#3d4b68",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  metaCellValue: {
    color: "#dce4f0",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  metaCellValueMuted: {
    color: "#526080",
    fontSize: 13,
    fontWeight: "500",
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  metaCellValueMono: {
    color: "#8494b2",
    fontSize: 12,
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace'
  },
  metaStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  inlineSaveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(99,130,190,0.03)",
    paddingHorizontal: 14,
    paddingVertical: 4
  },
  contextInput: {
    flex: 1,
    color: "#8494b2",
    fontSize: 14,
    paddingVertical: 8,
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  contextOpenBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,212,170,0.10)"
  },
  activityDivider: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(99,130,190,0.06)"
  },
  attachmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  attachmentOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4
  },
  attachmentOpenText: {
    color: "#8494b2",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  logPayloadToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  taskWorkspaceMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#0c0f18"
  },
  taskWorkspaceMainScroll: {
    flex: 1
  },
  summaryActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: "rgba(99,130,190,0.06)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  summaryActionPillText: {
    color: "#8494b2",
    fontWeight: "600",
    fontSize: 12,
    fontFamily: F
  },
  blockerShell: {
    borderRadius: 14,
    overflow: "hidden"
  },
  primaryButtonSmall: {
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  primaryButtonText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: F
  },
  quietButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  quietButtonText: {
    color: "#8494b2",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: F
  },
  buttonDisabled: {
    opacity: 0.45
  },
  uploadHint: {
    color: "#526080",
    fontSize: 13,
    fontFamily: F
  },
  inlineError: {
    color: "#fda4af",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: F
  },
  activityTabs: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap"
  },
  activityTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  activityTabActive: {
    backgroundColor: "rgba(0,212,170,0.10)",
    borderColor: "rgba(0,212,170,0.25)"
  },
  activityTabText: {
    color: "#526080",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: F
  },
  activityTabTextActive: {
    color: "#5df5d0"
  },
  activityTabCount: {
    minWidth: 20,
    textAlign: "center",
    color: "#3d4b68",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: FM
  },
  activityTabCountActive: {
    color: "#00d4aa"
  },
  commentStack: {
    gap: 10
  },
  commentCard: {
    borderRadius: 12,
    backgroundColor: "rgba(99,130,190,0.03)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    padding: 14,
    gap: 10
  },
  commentHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap"
  },
  authorBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  authorBadgeAi: {
    backgroundColor: "rgba(91,141,239,0.15)"
  },
  authorBadgeHuman: {
    backgroundColor: "rgba(0,212,170,0.12)"
  },
  authorBadgeText: {
    color: "#dce4f0",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: F
  },
  commentType: {
    color: "#00d4aa",
    fontWeight: "700",
    textTransform: "capitalize",
    fontSize: 12,
    fontFamily: F
  },
  commentTimestamp: {
    color: "#3d4b68",
    fontSize: 12,
    fontFamily: FM
  },
  commentBody: {
    color: "#8494b2",
    lineHeight: 22,
    fontSize: 14,
    fontFamily: F
  },
  attachmentCard: {
    borderRadius: 10,
    backgroundColor: "rgba(99,130,190,0.04)",
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)"
  },
  attachmentTitle: {
    color: "#dce4f0",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: F
  },
  attachmentMeta: {
    color: "#526080",
    fontSize: 12,
    fontFamily: F
  },
  attachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: "#0e1220"
  },
  previewCard: {
    borderRadius: 10,
    backgroundColor: "rgba(6,8,16,0.60)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    padding: 12,
    gap: 6
  },
  previewText: {
    color: "#8494b2",
    lineHeight: 20,
    fontSize: 13,
    fontFamily: F
  },
  logPayloadCard: {
    borderRadius: 10,
    backgroundColor: "rgba(6,8,16,0.70)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.06)",
    padding: 12,
    gap: 10
  },
  logPayloadText: {
    color: "#8494b2",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "JetBrains Mono, SF Mono, Menlo, monospace"
    })
  },
  emptyStateCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(99,130,190,0.03)",
    padding: 20,
    gap: 6
  },
  emptyStateText: {
    color: "#526080",
    lineHeight: 22,
    fontSize: 14,
    fontFamily: F
  },
  composerDock: {
    borderTopWidth: 1,
    borderTopColor: "rgba(99,130,190,0.08)",
    backgroundColor: "#080b13",
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10
  },
  composerDockRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12
  },
  composerInputShell: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "#0e1220",
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10
  },
  composerInput: {
    flex: 1,
    minHeight: 26,
    maxHeight: 100,
    color: "#dce4f0",
    fontSize: 14,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: "center",
    fontFamily: F
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 2
  },
  composerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,130,190,0.06)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)"
  },
  composerSubmitButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00856b"
  },
  composerDockMuted: {
    borderTopWidth: 1,
    borderTopColor: "rgba(99,130,190,0.08)",
    backgroundColor: "#080b13",
    paddingHorizontal: 28,
    paddingVertical: 16
  },
  composerDockMutedText: {
    color: "#3d4b68",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: F
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(3,4,8,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  modalCard: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 16,
    backgroundColor: "#0e1220",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    overflow: "hidden"
  },
  modalCardSmall: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: "#0e1220",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    overflow: "hidden"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16
  },
  modalTitle: {
    color: "#f0f4fa",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontFamily: F
  },
  modalSubtle: {
    color: "#526080",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    fontFamily: F
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 14
  },
  modalTitleInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.04)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f0f4fa",
    fontSize: 22,
    fontWeight: "800",
    fontFamily: F
  },
  modalTextInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#dce4f0",
    fontSize: 14,
    fontFamily: F
  },
  modalChoiceRow: {
    gap: 16
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(99,130,190,0.08)",
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10
  },
  modalGhostButton: {
    borderRadius: 8,
    backgroundColor: "rgba(99,130,190,0.08)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  modalGhostButtonText: {
    color: "#8494b2",
    fontWeight: "600",
    fontSize: 14,
    fontFamily: F
  },
  modalPrimaryButton: {
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  modalPrimaryButtonText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: F
  },
  modalDangerButton: {
    borderRadius: 8,
    backgroundColor: "rgba(244,63,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.25)",
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  modalDangerButtonText: {
    color: "#fda4af",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: F
  },
  deleteConfirmText: {
    color: "#8494b2",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: F
  },
  deleteConfirmStrong: {
    color: "#dce4f0",
    fontWeight: "700"
  }
});
