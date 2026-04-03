import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { uploadTaskFile } from "../data/api";
import { executionModeToWire, toTask, type WireTask } from "../data/wire";
import type { BlockerSubmission } from "../lib/blockerSubmission";
import { parseTaskUrgency } from "../lib/taskDrafts";
import { pickFileForUpload } from "../lib/uploads";
import type { Task, TaskExecutionMode, TaskStatus } from "../types";

export interface CreateTaskPayload {
  title: string;
  assignee: "ai" | "human";
  runtime: string;
  executionMode: TaskExecutionMode;
  urgency: string;
  contextLink: string;
}

interface UseTaskMutationsOptions {
  apiRequest: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  selectedTask: Task | null;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  setSelectedTaskId: Dispatch<SetStateAction<string>>;
  setApiError: Dispatch<SetStateAction<string | null>>;
  loadOverview: () => Promise<void>;
  loadTaskDetail: (taskId: string) => Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function requireTaskUrgency(value: string): number {
  const urgency = parseTaskUrgency(value);
  if (urgency === null) {
    throw new Error("Urgency must be a whole number from 1 to 5.");
  }
  return urgency;
}

export function useTaskMutations({
  apiRequest,
  selectedTask,
  noteDraft,
  setNoteDraft,
  setSelectedTaskId,
  setApiError,
  loadOverview,
  loadTaskDetail,
}: UseTaskMutationsOptions) {
  const [busyAction, setBusyAction] = useState("");
  const selectedTaskRef = useRef(selectedTask);
  const noteDraftRef = useRef(noteDraft);

  selectedTaskRef.current = selectedTask;
  noteDraftRef.current = noteDraft;

  const statusAction = useCallback(
    async (task: Task, status: TaskStatus) => {
      setBusyAction(`${task.id}:${status}`);
      try {
        await apiRequest(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status, updated_by: "human", allow_override: true }),
        });
        await Promise.all([loadOverview(), loadTaskDetail(task.id)]);
        setApiError(null);
      } catch (error) {
        setApiError(errorMessage(error, "Failed to update task."));
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, loadTaskDetail, setApiError]
  );

  const toggleTaskDone = useCallback(
    (task: Task) => {
      void statusAction(task, task.status === "done" ? "pending" : "done");
    },
    [statusAction]
  );

  const requestCheckIn = useCallback(async () => {
    if (!selectedTask) {
      return;
    }
    setBusyAction(`checkin:${selectedTask.id}`);
    try {
      await apiRequest(`/tasks/${selectedTask.id}/check-in-request`, {
        method: "POST",
        body: JSON.stringify({ requested_by: "human" }),
      });
      await Promise.all([loadTaskDetail(selectedTask.id), loadOverview()]);
      setApiError(null);
    } catch (error) {
      setApiError(errorMessage(error, "Failed to request check-in."));
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadOverview, loadTaskDetail, selectedTask, setApiError]);

  const createTask = useCallback(
    async (payload: CreateTaskPayload) => {
      setBusyAction("create-task");
      try {
        const urgency = requireTaskUrgency(payload.urgency);
        const createdPayload = await apiRequest("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: payload.title.trim(),
            assignee: payload.assignee,
            target_runtime:
              payload.assignee === "ai" && payload.runtime !== "any" ? payload.runtime : null,
            execution_mode: executionModeToWire(payload.executionMode),
            ai_urgency: urgency,
            context_link: payload.contextLink.trim() || null,
            updated_by: "human",
          }),
        });
        const created = toTask(createdPayload.task as WireTask);
        await loadOverview();
        setSelectedTaskId(created.id);
        setApiError(null);
      } catch (error) {
        const message = errorMessage(error, "Failed to create task.");
        setApiError(message);
        throw new Error(message);
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, setApiError, setSelectedTaskId]
  );

  const createWorkspace = useCallback(
    async (name: string) => {
      setBusyAction("create-workspace");
      try {
        await apiRequest("/workspaces", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), set_active: true }),
        });
        await loadOverview();
        setApiError(null);
      } catch (error) {
        const message = errorMessage(error, "Failed to create workspace.");
        setApiError(message);
        throw new Error(message);
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, setApiError]
  );

  const switchWorkspace = useCallback(
    async (name: string) => {
      setBusyAction(`workspace:${name}`);
      try {
        await apiRequest("/workspaces/active", {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        setSelectedTaskId("");
        await loadOverview();
        setApiError(null);
      } catch (error) {
        setApiError(errorMessage(error, "Failed to switch workspace."));
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, setApiError, setSelectedTaskId]
  );

  const addNote = useCallback(async () => {
    if (!selectedTask || !noteDraft.trim()) {
      return;
    }
    setBusyAction(`note:${selectedTask.id}`);
    try {
      await apiRequest(`/tasks/${selectedTask.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          author: "human",
          kind: "note",
          content: noteDraft.trim(),
        }),
      });
      setNoteDraft("");
      await loadTaskDetail(selectedTask.id);
      setApiError(null);
    } catch (error) {
      setApiError(errorMessage(error, "Failed to add note."));
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadTaskDetail, noteDraft, selectedTask, setApiError, setNoteDraft]);

  const uploadAttachment = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    const taskId = selectedTask.id;
    const noteContent = noteDraftRef.current.trim();

    try {
      const draft = await pickFileForUpload();
      if (!draft) {
        return;
      }

      if (selectedTaskRef.current?.id !== taskId) {
        setApiError("Task changed while selecting a file. Please try again.");
        return;
      }

      setBusyAction(`attachment:${taskId}`);
      try {
        const attachment = await uploadTaskFile(apiRequest, taskId, draft);
        await apiRequest(`/tasks/${taskId}/notes`, {
          method: "POST",
          body: JSON.stringify({
            author: "human",
            kind: "attachment",
            content: noteContent || `Uploaded ${attachment.filename ?? draft.filename}.`,
            attachment,
          }),
        });
        setNoteDraft("");
        await loadTaskDetail(taskId);
        setApiError(null);
      } finally {
        setBusyAction("");
      }
    } catch (error) {
      setApiError(errorMessage(error, "Failed to upload attachment."));
    }
  }, [apiRequest, loadTaskDetail, selectedTask, setApiError, setNoteDraft]);

  const respondToBlocker = useCallback(
    async (submission: BlockerSubmission) => {
      if (!selectedTask) {
        return;
      }

      setBusyAction(`respond:${selectedTask.id}`);
      try {
        let response: Record<string, unknown>;
        if (submission.type === "file_or_photo") {
          const files = await Promise.all(
            submission.files.map((draft) => uploadTaskFile(apiRequest, selectedTask.id, draft))
          );
          response = { type: "file_or_photo", files };
        } else if (submission.type === "choice") {
          response = { type: "choice", selections: submission.selections };
        } else if (submission.type === "approve_reject") {
          response = { type: "approve_reject", approved: submission.approved };
        } else {
          response = { type: "text_input", value: submission.value };
        }

        await apiRequest(`/tasks/${selectedTask.id}/respond`, {
          method: "POST",
          body: JSON.stringify({
            updated_by: "human",
            response,
          }),
        });

        await Promise.all([loadTaskDetail(selectedTask.id), loadOverview()]);
        setApiError(null);
      } catch (error) {
        setApiError(errorMessage(error, "Failed to respond to blocker."));
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, loadTaskDetail, selectedTask, setApiError]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      setBusyAction(`delete:${taskId}`);
      try {
        await apiRequest(`/tasks/${taskId}`, { method: "DELETE" });
        setSelectedTaskId((current) => (current === taskId ? "" : current));
        await loadOverview();
        setApiError(null);
      } catch (error) {
        const message = errorMessage(error, "Failed to delete task.");
        setApiError(message);
        throw new Error(message);
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, setApiError, setSelectedTaskId]
  );

  return {
    busyAction,
    statusAction,
    toggleTaskDone,
    requestCheckIn,
    createTask,
    createWorkspace,
    switchWorkspace,
    addNote,
    uploadAttachment,
    respondToBlocker,
    deleteTask,
  };
}
