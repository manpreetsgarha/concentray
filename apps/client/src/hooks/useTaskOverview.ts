import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toTask, toWorkspace, type WireTask, type WireWorkspace } from "../data/wire";
import { sortTasks } from "../lib/formatters";
import type { Task, TaskStatus, WorkspaceSummary } from "../types";

interface UseTaskOverviewOptions {
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  onError: (message: string | null) => void;
}

export function reconcileSelectedTaskId(current: string, nextTasks: Task[]): string {
  if (current && nextTasks.some((task) => task.id === current)) {
    return current;
  }
  if (current && nextTasks.length === 0) {
    return current;
  }
  return nextTasks[0]?.id ?? "";
}

export function useTaskOverview({ apiRequest, onError }: UseTaskOverviewOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "ai" | "human">("all");
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setRefreshing(true);
    try {
      const [workspacePayload, taskPayload] = await Promise.all([
        apiRequest("/workspaces"),
        apiRequest("/tasks"),
      ]);
      if (requestId !== latestRequestId.current) {
        return;
      }
      const nextWorkspaces = ((workspacePayload.workspaces as WireWorkspace[]) ?? []).map(toWorkspace);
      const nextTasks = ((taskPayload.tasks as WireTask[]) ?? []).map(toTask);
      startTransition(() => {
        setWorkspaces(nextWorkspaces);
        setTasks(nextTasks);
        setSelectedTaskId((current) => reconcileSelectedTaskId(current, nextTasks));
      });
      onError(null);
    } catch (error) {
      if (requestId !== latestRequestId.current) {
        return;
      }
      onError(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      if (requestId === latestRequestId.current) {
        setRefreshing(false);
      }
    }
  }, [apiRequest, onError]);

  useEffect(() => {
    void loadOverview();
    const timer = setInterval(() => {
      void loadOverview();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks]
  );

  const filteredTasks = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    return sortTasks(tasks).filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (assigneeFilter !== "all" && task.assignee !== assigneeFilter) {
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

  return {
    workspaces,
    tasks,
    selectedTaskId,
    selectedTask,
    filteredTasks,
    taskQuery,
    statusFilter,
    assigneeFilter,
    refreshing,
    loadOverview,
    setSelectedTaskId,
    setTaskQuery,
    setStatusFilter,
    setAssigneeFilter,
  };
}
