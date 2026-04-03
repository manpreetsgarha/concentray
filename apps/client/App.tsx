import { StatusBar } from "expo-status-bar";
import React, { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import type { BlockerSubmission } from "./src/BlockerCard";
import { uploadTaskFile } from "./src/data/api";
import {
  executionModeToWire,
  toActivity,
  toNote,
  toRun,
  toTask,
  toWorkspace,
  type WireActivity,
  type WireNote,
  type WireRun,
  type WireTask,
  type WireWorkspace,
} from "./src/data/wire";
import { useLocalApi } from "./src/hooks/useLocalApi";
import { sortTasks } from "./src/lib/formatters";
import { pickFileForUpload } from "./src/lib/uploads";
import type { Activity, Run, Task, TaskExecutionMode, TaskStatus, WorkspaceSummary } from "./src/types";
import { ConfirmDialog } from "./src/ui/ConfirmDialog";
import { ChoiceGroup } from "./src/ui/forms/ChoiceGroup";
import { FONT_SANS } from "./src/ui/theme";
import {
  TaskDetailPane,
  type DetailTab,
  type PendingCheckIn,
} from "./src/ui/tasks/TaskDetailPane";
import { TaskSidebar } from "./src/ui/tasks/TaskSidebar";

function runtimeOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "Any", value: "any" },
    { label: "OpenClaw", value: "openclaw" },
    { label: "Claude", value: "claude" },
    { label: "Codex", value: "codex" },
  ];
}

export default function App() {
  const sharedApiUrl = (process.env.EXPO_PUBLIC_LOCAL_API_URL ?? "").trim();
  const apiRequest = useLocalApi(sharedApiUrl);
  const { width } = useWindowDimensions();
  const singleColumn = width < 1080;

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<ReturnType<typeof toNote>[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity[]>([]);
  const [pendingCheckIn, setPendingCheckIn] = useState<PendingCheckIn>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "ai" | "human">("all");
  const [detailTab, setDetailTab] = useState<DetailTab>("notes");
  const [apiError, setApiError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskRuntime, setTaskRuntime] = useState("openclaw");
  const [taskAssignee, setTaskAssignee] = useState<"ai" | "human">("ai");
  const [taskExecutionMode, setTaskExecutionMode] = useState<TaskExecutionMode>("autonomous");
  const [taskUrgency, setTaskUrgency] = useState("3");
  const [taskContextLink, setTaskContextLink] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [taskToDeleteId, setTaskToDeleteId] = useState("");

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      return;
    }
    if (!doc.querySelector('link[href*="Plus+Jakarta+Sans"]')) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
      doc.head.appendChild(link);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const [workspacePayload, taskPayload] = await Promise.all([
        apiRequest("/workspaces"),
        apiRequest("/tasks"),
      ]);
      const nextWorkspaces = ((workspacePayload.workspaces as WireWorkspace[]) ?? []).map(toWorkspace);
      const nextTasks = ((taskPayload.tasks as WireTask[]) ?? []).map(toTask);
      startTransition(() => {
        setWorkspaces(nextWorkspaces);
        setTasks(nextTasks);
        setSelectedTaskId((current) => current || nextTasks[0]?.id || "");
      });
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      setRefreshing(false);
    }
  }, [apiRequest]);

  const loadTaskDetail = useCallback(
    async (taskId: string) => {
      if (!taskId) {
        setSelectedRun(null);
        setSelectedNotes([]);
        setSelectedActivity([]);
        setPendingCheckIn(null);
        return;
      }

      try {
        const [taskPayload, notesPayload, activityPayload] = await Promise.all([
          apiRequest(`/tasks/${taskId}`),
          apiRequest(`/tasks/${taskId}/notes`),
          apiRequest(`/tasks/${taskId}/activity`),
        ]);

        startTransition(() => {
          setSelectedRun(taskPayload.active_run ? toRun(taskPayload.active_run as WireRun) : null);
          setSelectedNotes(((notesPayload.notes as WireNote[]) ?? []).map(toNote));
          setSelectedActivity(((activityPayload.activity as WireActivity[]) ?? []).map(toActivity));
          setPendingCheckIn((taskPayload.pending_check_in as PendingCheckIn) ?? null);
        });
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to load task detail.");
      }
    },
    [apiRequest]
  );

  useEffect(() => {
    void loadOverview();
    const timer = setInterval(() => {
      void loadOverview();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  useEffect(() => {
    if (!tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0]?.id ?? "");
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    void loadTaskDetail(selectedTaskId);
    setDetailTab("notes");
  }, [loadTaskDetail, selectedTaskId]);

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
        setApiError(error instanceof Error ? error.message : "Failed to update task.");
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, loadTaskDetail]
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
      setApiError(error instanceof Error ? error.message : "Failed to request check-in.");
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadOverview, loadTaskDetail, selectedTask]);

  const createTask = useCallback(async () => {
    setBusyAction("create-task");
    try {
      const payload = await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle,
          assignee: taskAssignee,
          target_runtime: taskAssignee === "ai" && taskRuntime !== "any" ? taskRuntime : null,
          execution_mode: executionModeToWire(taskExecutionMode),
          ai_urgency: Number(taskUrgency || "3"),
          context_link: taskContextLink.trim() || null,
          updated_by: "human",
        }),
      });
      const created = toTask(payload.task as WireTask);
      setShowCreateTask(false);
      setTaskTitle("");
      setTaskRuntime("openclaw");
      setTaskAssignee("ai");
      setTaskExecutionMode("autonomous");
      setTaskUrgency("3");
      setTaskContextLink("");
      await loadOverview();
      setSelectedTaskId(created.id);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to create task.");
    } finally {
      setBusyAction("");
    }
  }, [
    apiRequest,
    loadOverview,
    taskAssignee,
    taskContextLink,
    taskExecutionMode,
    taskRuntime,
    taskTitle,
    taskUrgency,
  ]);

  const createWorkspace = useCallback(async () => {
    setBusyAction("create-workspace");
    try {
      await apiRequest("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName, set_active: true }),
      });
      setWorkspaceName("");
      setShowCreateWorkspace(false);
      await loadOverview();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to create workspace.");
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadOverview, workspaceName]);

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
        setApiError(error instanceof Error ? error.message : "Failed to switch workspace.");
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview]
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
      setApiError(error instanceof Error ? error.message : "Failed to add note.");
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadTaskDetail, noteDraft, selectedTask]);

  const uploadAttachment = useCallback(async () => {
    if (!selectedTask || Platform.OS !== "web") {
      return;
    }

    const draft = await pickFileForUpload();
    if (!draft) {
      return;
    }

    setBusyAction(`attachment:${selectedTask.id}`);
    try {
      const attachment = await uploadTaskFile(apiRequest, selectedTask.id, draft);
      await apiRequest(`/tasks/${selectedTask.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          author: "human",
          kind: "attachment",
          content: noteDraft.trim() || `Uploaded ${attachment.filename ?? draft.filename}.`,
          attachment,
        }),
      });
      setNoteDraft("");
      await loadTaskDetail(selectedTask.id);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to upload attachment.");
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadTaskDetail, noteDraft, selectedTask]);

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
        setApiError(error instanceof Error ? error.message : "Failed to respond to blocker.");
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, loadTaskDetail, selectedTask]
  );

  const confirmDeleteTask = useCallback(async () => {
    if (!taskToDeleteId) {
      return;
    }

    setBusyAction(`delete:${taskToDeleteId}`);
    try {
      await apiRequest(`/tasks/${taskToDeleteId}`, { method: "DELETE" });
      setTaskToDeleteId("");
      setSelectedTaskId((current) => (current === taskToDeleteId ? "" : current));
      await loadOverview();
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to delete task.");
    } finally {
      setBusyAction("");
    }
  }, [apiRequest, loadOverview, taskToDeleteId]);

  if (!sharedApiUrl) {
    return (
      <SafeAreaView style={styles.emptyShell}>
        <StatusBar style="light" />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Connect the local task engine</Text>
          <Text style={styles.emptyBody}>
            Start the shared API and run the web app with `EXPO_PUBLIC_LOCAL_API_URL` set.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.backgroundGlowOne} />
      <View style={styles.backgroundGlowTwo} />

      <View style={[styles.shell, singleColumn ? styles.shellColumn : null]}>
        <TaskSidebar
          workspaces={workspaces}
          tasks={filteredTasks}
          selectedTaskId={selectedTaskId}
          refreshing={refreshing}
          busyAction={busyAction}
          apiError={apiError}
          taskQuery={taskQuery}
          statusFilter={statusFilter}
          assigneeFilter={assigneeFilter}
          onRefresh={() => void loadOverview()}
          onTaskQueryChange={setTaskQuery}
          onStatusFilterChange={setStatusFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          onSelectTask={setSelectedTaskId}
          onToggleTaskDone={toggleTaskDone}
          onCreateTask={() => setShowCreateTask(true)}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onSwitchWorkspace={(name) => void switchWorkspace(name)}
        />

        <TaskDetailPane
          task={selectedTask}
          run={selectedRun}
          notes={selectedNotes}
          activity={selectedActivity}
          pendingCheckIn={pendingCheckIn}
          detailTab={detailTab}
          noteDraft={noteDraft}
          busyAction={busyAction}
          onDetailTabChange={setDetailTab}
          onStatusChange={(task, status) => void statusAction(task, status)}
          onRequestCheckIn={() => void requestCheckIn()}
          onNoteDraftChange={setNoteDraft}
          onAddNote={() => void addNote()}
          onUploadAttachment={() => void uploadAttachment()}
          onRespond={(submission) => void respondToBlocker(submission)}
          onDelete={() => setTaskToDeleteId(selectedTask?.id ?? "")}
        />
      </View>

      <Modal transparent visible={showCreateTask} animationType="fade" onRequestClose={() => setShowCreateTask(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create task</Text>
            <TextInput
              style={styles.modalInput}
              value={taskTitle}
              onChangeText={setTaskTitle}
              placeholder="Task title"
              placeholderTextColor="#6b7d9a"
            />
            <TextInput
              style={styles.modalInput}
              value={taskContextLink}
              onChangeText={setTaskContextLink}
              placeholder="Context link"
              placeholderTextColor="#6b7d9a"
            />
            <TextInput
              style={styles.modalInput}
              value={taskUrgency}
              onChangeText={setTaskUrgency}
              placeholder="Urgency 1-5"
              placeholderTextColor="#6b7d9a"
            />
            <ChoiceGroup
              label="Assigned To"
              value={taskAssignee}
              onChange={(value) => setTaskAssignee(value as "ai" | "human")}
              options={[
                { label: "AI", value: "ai" },
                { label: "Human", value: "human" },
              ]}
            />
            <ChoiceGroup label="Runs On" value={taskRuntime} onChange={setTaskRuntime} options={runtimeOptions()} />
            <ChoiceGroup
              label="Execution"
              value={taskExecutionMode}
              onChange={(value) => setTaskExecutionMode(value as TaskExecutionMode)}
              options={[
                { label: "Autonomous", value: "autonomous" },
                { label: "Session", value: "session" },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => setShowCreateTask(false)}>
                <Text style={styles.modalSecondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimary, busyAction === "create-task" ? styles.buttonDisabled : null]}
                onPress={() => void createTask()}
                disabled={busyAction === "create-task"}
              >
                <Text style={styles.modalPrimaryLabel}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showCreateWorkspace}
        animationType="fade"
        onRequestClose={() => setShowCreateWorkspace(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create workspace</Text>
            <TextInput
              style={styles.modalInput}
              value={workspaceName}
              onChangeText={setWorkspaceName}
              placeholder="Workspace name"
              placeholderTextColor="#6b7d9a"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => setShowCreateWorkspace(false)}>
                <Text style={styles.modalSecondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimary, busyAction === "create-workspace" ? styles.buttonDisabled : null]}
                onPress={() => void createWorkspace()}
                disabled={busyAction === "create-workspace"}
              >
                <Text style={styles.modalPrimaryLabel}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={Boolean(taskToDeleteId)}
        title="Delete task?"
        body="This removes the task, notes, runs, and activity from the local store."
        confirmLabel="Delete Task"
        busy={busyAction === `delete:${taskToDeleteId}`}
        onCancel={() => setTaskToDeleteId("")}
        onConfirm={() => void confirmDeleteTask()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#050915",
  },
  backgroundGlowOne: {
    position: "absolute",
    top: -120,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(0,212,170,0.08)",
  },
  backgroundGlowTwo: {
    position: "absolute",
    right: -120,
    bottom: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(91,141,239,0.08)",
  },
  shell: {
    flex: 1,
    flexDirection: "row",
    gap: 20,
    padding: 20,
  },
  shellColumn: {
    flexDirection: "column",
  },
  emptyShell: {
    flex: 1,
    backgroundColor: "#050915",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(9,15,26,0.86)",
    padding: 28,
    gap: 12,
  },
  emptyTitle: {
    color: "#f0f4fa",
    fontSize: 24,
    fontWeight: "800",
    fontFamily: FONT_SANS,
  },
  emptyBody: {
    color: "#8494b2",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FONT_SANS,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,8,16,0.72)",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "#0f1624",
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    color: "#f0f4fa",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.04)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#dce4f0",
    fontSize: 14,
    fontFamily: FONT_SANS,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  modalSecondary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSecondaryLabel: {
    color: "#dce4f0",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  modalPrimary: {
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalPrimaryLabel: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
