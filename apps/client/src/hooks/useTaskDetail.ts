import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  toActivity,
  toNote,
  toPendingCheckIn,
  toRun,
  type WireActivity,
  type WireNote,
  type WireRun,
} from "../data/wire";
import type { Activity, DetailTab, Note, PendingCheckIn, Run } from "../types";

export interface TaskDetailSnapshot {
  run: Run | null;
  notes: Note[];
  activity: Activity[];
  pendingCheckIn: PendingCheckIn;
}

interface UseTaskDetailOptions {
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  taskId: string;
  onError: (message: string | null) => void;
}

interface CreateTaskDetailLoaderOptions {
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  onError: (message: string | null) => void;
  applySnapshot: (snapshot: TaskDetailSnapshot) => void;
  transition?: (callback: () => void) => void;
  latestRequestIdRef?: { current: number };
}

export const EMPTY_TASK_DETAIL: TaskDetailSnapshot = {
  run: null,
  notes: [],
  activity: [],
  pendingCheckIn: null,
};

function taskDetailErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load task detail.";
}

export async function fetchTaskDetailSnapshot(
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>,
  taskId: string
): Promise<TaskDetailSnapshot> {
  const [taskPayload, notesPayload, activityPayload] = await Promise.all([
    apiRequest(`/tasks/${taskId}`),
    apiRequest(`/tasks/${taskId}/notes`),
    apiRequest(`/tasks/${taskId}/activity`),
  ]);

  return {
    run: taskPayload.active_run ? toRun(taskPayload.active_run as WireRun) : null,
    notes: ((notesPayload.notes as WireNote[]) ?? []).map(toNote),
    activity: ((activityPayload.activity as WireActivity[]) ?? []).map(toActivity),
    pendingCheckIn: toPendingCheckIn(taskPayload.pending_check_in),
  };
}

export function createTaskDetailLoader({
  apiRequest,
  onError,
  applySnapshot,
  transition = startTransition,
  latestRequestIdRef,
}: CreateTaskDetailLoaderOptions) {
  const requestState = latestRequestIdRef ?? { current: 0 };

  return async (nextTaskId: string) => {
    const requestId = ++requestState.current;
    applySnapshot(EMPTY_TASK_DETAIL);

    if (!nextTaskId) {
      return;
    }

    try {
      const snapshot = await fetchTaskDetailSnapshot(apiRequest, nextTaskId);
      if (requestId !== requestState.current) {
        return;
      }
      transition(() => {
        applySnapshot(snapshot);
      });
      onError(null);
    } catch (error) {
      if (requestId !== requestState.current) {
        return;
      }
      applySnapshot(EMPTY_TASK_DETAIL);
      onError(taskDetailErrorMessage(error));
    }
  };
}

export function useTaskDetail({ apiRequest, taskId, onError }: UseTaskDetailOptions) {
  const [run, setRun] = useState<Run | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [pendingCheckIn, setPendingCheckIn] = useState<PendingCheckIn>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("notes");
  const [noteDraft, setNoteDraft] = useState("");
  const latestRequestId = useRef(0);

  const applySnapshot = useCallback(
    (snapshot: TaskDetailSnapshot) => {
      setRun(snapshot.run);
      setNotes(snapshot.notes);
      setActivity(snapshot.activity);
      setPendingCheckIn(snapshot.pendingCheckIn);
    },
    []
  );

  const loadTaskDetail = useMemo(
    () =>
      createTaskDetailLoader({
        apiRequest,
        onError,
        applySnapshot,
        latestRequestIdRef: latestRequestId,
      }),
    [apiRequest, applySnapshot, onError]
  );

  useEffect(() => {
    setDetailTab("notes");
    setNoteDraft("");
    void loadTaskDetail(taskId);
  }, [loadTaskDetail, taskId]);

  return {
    run,
    notes,
    activity,
    pendingCheckIn,
    detailTab,
    noteDraft,
    loadTaskDetail,
    setDetailTab,
    setNoteDraft,
  };
}
