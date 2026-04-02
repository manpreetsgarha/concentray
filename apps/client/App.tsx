import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  useWindowDimensions,
} from "react-native";

import type { Activity, Run, Runtime, Task, TaskExecutionMode, TaskStatus, WorkspaceSummary } from "./src/types";
import { executionModeToWire, statusToWire, toActivity, toNote, toRun, toTask, toWorkspace, type WireActivity, type WireNote, type WireRun, type WireTask, type WireWorkspace } from "./src/data/wire";
import { formatMetadataJson, formatTimestamp, humanAssignee, humanExecutionMode, humanRuntime, humanStatus, looksLikeUrl, sortTasks } from "./src/lib/formatters";
import { LogoMark } from "./src/ui/brand/LogoMark";
import { ChoiceGroup } from "./src/ui/forms/ChoiceGroup";
import { FilterChip } from "./src/ui/forms/FilterChip";
import { TaskListItem } from "./src/ui/tasks/TaskListItem";
import { WorkspaceCard } from "./src/ui/workspaces/WorkspaceCard";

type DetailTab = "notes" | "activity";
type PendingCheckIn = { requested_at: string; requested_by: string } | null;

function isRunWarning(run: Run | null): boolean {
  if (!run || run.status !== "active") {
    return false;
  }
  return Date.now() - new Date(run.lastHeartbeatAt).getTime() >= 180 * 1000;
}

function statusOptions(): Array<{ label: string; value: TaskStatus }> {
  return [
    { label: "Pending", value: "pending" },
    { label: "In Progress", value: "in_progress" },
    { label: "Blocked", value: "blocked" },
    { label: "Done", value: "done" },
  ];
}

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
      link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
      doc.head.appendChild(link);
    }
  }, []);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!sharedApiUrl) {
        throw new Error("Set EXPO_PUBLIC_LOCAL_API_URL before running the client.");
      }
      const response = await fetch(`${sharedApiUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.ok === false) {
        throw new Error(String(payload.error ?? `Request failed (${response.status})`));
      }
      return payload;
    },
    [sharedApiUrl],
  );

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const [workspacePayload, taskPayload] = await Promise.all([apiRequest("/workspaces"), apiRequest("/tasks")]);
      setWorkspaces(((workspacePayload.workspaces as WireWorkspace[]) ?? []).map(toWorkspace));
      const nextTasks = ((taskPayload.tasks as WireTask[]) ?? []).map(toTask);
      setTasks(nextTasks);
      setApiError(null);
      if (!selectedTaskId && nextTasks[0]) {
        setSelectedTaskId(nextTasks[0].id);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      setRefreshing(false);
    }
  }, [apiRequest, selectedTaskId]);

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
        setSelectedRun(taskPayload.active_run ? toRun(taskPayload.active_run as WireRun) : null);
        setSelectedNotes(((notesPayload.notes as WireNote[]) ?? []).map(toNote));
        setSelectedActivity(((activityPayload.activity as WireActivity[]) ?? []).map(toActivity));
        setPendingCheckIn((taskPayload.pending_check_in as PendingCheckIn) ?? null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to load task detail.");
      }
    },
    [apiRequest],
  );

  useEffect(() => {
    void loadOverview();
    const timer = setInterval(() => {
      void loadOverview();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  useEffect(() => {
    if (!tasks.some((task) => task.id === selectedTaskId) && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    void loadTaskDetail(selectedTaskId);
    setDetailTab("notes");
  }, [loadTaskDetail, selectedTaskId]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, tasks]);
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
      return task.title.toLowerCase().includes(query) || (task.contextLink ?? "").toLowerCase().includes(query);
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
        await loadOverview();
        await loadTaskDetail(task.id);
        setApiError(null);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Failed to update task.");
      } finally {
        setBusyAction("");
      }
    },
    [apiRequest, loadOverview, loadTaskDetail],
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
      await loadTaskDetail(selectedTask.id);
      await loadOverview();
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
  }, [apiRequest, loadOverview, taskAssignee, taskContextLink, taskExecutionMode, taskRuntime, taskTitle, taskUrgency]);

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
    [apiRequest, loadOverview],
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

  if (!sharedApiUrl) {
    return (
      <SafeAreaView style={styles.emptyShell}>
        <StatusBar style="light" />
        <View style={styles.emptyCard}>
          <LogoMark />
          <Text style={styles.emptyTitle}>Connect the local task engine</Text>
          <Text style={styles.emptyBody}>Start the shared API and run the web app with `EXPO_PUBLIC_LOCAL_API_URL` set.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={[styles.shell, singleColumn ? styles.shellColumn : null]}>
        <View style={[styles.sidebar, singleColumn ? styles.sidebarColumn : null]}>
          <View style={styles.brandRow}>
            <LogoMark />
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>Concentray v2</Text>
              <Text style={styles.brandSubtitle}>Local AI task engine</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => void loadOverview()}>
              <Feather name={refreshing ? "loader" : "refresh-cw"} size={16} color="#e8eef8" />
            </Pressable>
          </View>

          {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Workspaces</Text>
            <Pressable style={styles.textButton} onPress={() => setShowCreateWorkspace(true)}>
              <Text style={styles.textButtonLabel}>New</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.workspaceList}>
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.name}
                workspace={workspace}
                isSelected={workspace.active}
                busy={busyAction === `workspace:${workspace.name}`}
                onPress={() => void switchWorkspace(workspace.name)}
              />
            ))}
          </ScrollView>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Queue</Text>
            <Pressable style={styles.textButton} onPress={() => setShowCreateTask(true)}>
              <Text style={styles.textButtonLabel}>New Task</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.searchInput}
            value={taskQuery}
            onChangeText={setTaskQuery}
            placeholder="Search tasks"
            placeholderTextColor="#6b7d9a"
          />

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterRow}>
              {["all", "pending", "in_progress", "blocked", "done"].map((option) => (
                <FilterChip
                  key={option}
                  label={option === "all" ? "All" : humanStatus(option as TaskStatus)}
                  active={statusFilter === option}
                  onPress={() => setStatusFilter(option as "all" | TaskStatus)}
                />
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Assigned to</Text>
            <View style={styles.filterRow}>
              {["all", "ai", "human"].map((option) => (
                <FilterChip
                  key={option}
                  label={option === "all" ? "All" : option === "ai" ? "AI" : "Human"}
                  active={assigneeFilter === option}
                  onPress={() => setAssigneeFilter(option as "all" | "ai" | "human")}
                />
              ))}
            </View>
          </View>

          <ScrollView style={styles.taskList}>
            {filteredTasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                busy={Boolean(busyAction)}
                onPress={() => setSelectedTaskId(task.id)}
                onToggleDone={() => void statusAction(task, task.status === "done" ? "pending" : "done")}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.detailPane}>
          {selectedTask ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <View style={styles.detailHeader}>
                <Text style={styles.taskTitle}>{selectedTask.title}</Text>
                <View style={styles.headerActions}>
                  <Pressable style={styles.secondaryButton} onPress={() => void requestCheckIn()}>
                    <Text style={styles.secondaryButtonLabel}>Request Check-In</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Assigned to</Text>
                  <Text style={styles.metaValue}>{humanAssignee(selectedTask.assignee)}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Runs on</Text>
                  <Text style={styles.metaValue}>{selectedTask.assignee === "ai" ? humanRuntime(selectedTask.targetRuntime) : "Human task"}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Execution</Text>
                  <Text style={styles.metaValue}>{humanExecutionMode(selectedTask.executionMode)}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Status</Text>
                  <Text style={styles.metaValue}>{humanStatus(selectedTask.status)}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Worker</Text>
                  <Text style={styles.metaValue}>{selectedRun?.workerId ?? "Idle"}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>Last heartbeat</Text>
                  <Text style={styles.metaValue}>{selectedRun ? formatTimestamp(selectedRun.lastHeartbeatAt) : "None"}</Text>
                </View>
              </View>

              <View style={styles.bannerStack}>
                {pendingCheckIn ? (
                  <View style={styles.bannerCard}>
                    <Text style={styles.bannerTitle}>Awaiting check-in</Text>
                    <Text style={styles.bannerBody}>Requested {formatTimestamp(pendingCheckIn.requested_at)} by {pendingCheckIn.requested_by}.</Text>
                  </View>
                ) : null}
                {selectedRun && isRunWarning(selectedRun) ? (
                  <View style={[styles.bannerCard, styles.warningCard]}>
                    <Text style={styles.bannerTitle}>Worker may be stale</Text>
                    <Text style={styles.bannerBody}>Last heartbeat was {formatTimestamp(selectedRun.lastHeartbeatAt)}.</Text>
                  </View>
                ) : null}
                {!selectedRun && selectedActivity.some((entry) => entry.kind === "run_expired") ? (
                  <View style={styles.bannerCard}>
                    <Text style={styles.bannerTitle}>Recovered after timeout</Text>
                    <Text style={styles.bannerBody}>The previous worker stopped heartbeating and the task was released for recovery.</Text>
                  </View>
                ) : null}
              </View>

              {selectedTask.contextLink && looksLikeUrl(selectedTask.contextLink) ? (
                <Pressable style={styles.contextLinkCard} onPress={() => void Linking.openURL(selectedTask.contextLink ?? "")}>
                  <Text style={styles.contextLinkLabel}>Context</Text>
                  <Text style={styles.contextLinkValue}>{selectedTask.contextLink}</Text>
                </Pressable>
              ) : null}

              <View style={styles.statusRow}>
                {statusOptions().map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.statusButton, selectedTask.status === option.value ? styles.statusButtonActive : null]}
                    onPress={() => void statusAction(selectedTask, option.value)}
                  >
                    <Text style={[styles.statusButtonLabel, selectedTask.status === option.value ? styles.statusButtonLabelActive : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.tabRow}>
                {(["notes", "activity"] as DetailTab[]).map((tab) => (
                  <Pressable
                    key={tab}
                    style={[styles.tabButton, detailTab === tab ? styles.tabButtonActive : null]}
                    onPress={() => setDetailTab(tab)}
                  >
                    <Text style={[styles.tabButtonLabel, detailTab === tab ? styles.tabButtonLabelActive : null]}>
                      {tab === "notes" ? `Notes (${selectedNotes.length})` : `Activity (${selectedActivity.length})`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {detailTab === "notes" ? (
                <View style={styles.stack}>
                  {selectedNotes.map((note) => (
                    <View key={note.id} style={styles.feedCard}>
                      <View style={styles.feedCardHeader}>
                        <Text style={styles.feedCardTitle}>{note.kind === "attachment" ? "Attachment" : "Note"}</Text>
                        <Text style={styles.feedTimestamp}>{formatTimestamp(note.createdAt)}</Text>
                      </View>
                      <Text style={styles.feedBody}>{note.content || "No note content."}</Text>
                      {note.attachment ? <Text style={styles.feedMeta}>{JSON.stringify(note.attachment)}</Text> : null}
                    </View>
                  ))}
                  <View style={styles.composerCard}>
                    <TextInput
                      style={styles.noteInput}
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                      multiline
                      placeholder="Write a note for yourself"
                      placeholderTextColor="#6b7d9a"
                    />
                    <Pressable style={styles.primaryButton} onPress={() => void addNote()}>
                      <Text style={styles.primaryButtonLabel}>Add Note</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.stack}>
                  {selectedActivity.map((entry) => (
                    <View key={entry.id} style={styles.feedCard}>
                      <View style={styles.feedCardHeader}>
                        <Text style={styles.feedCardTitle}>{entry.summary}</Text>
                        <Text style={styles.feedTimestamp}>{formatTimestamp(entry.createdAt)}</Text>
                      </View>
                      <Text style={styles.feedMeta}>
                        {entry.kind} · {entry.actor}
                        {entry.runtime ? ` · ${humanRuntime(entry.runtime)}` : ""}
                      </Text>
                      {entry.payload ? <Text style={styles.payloadText}>{formatMetadataJson(entry.payload)}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No task selected</Text>
              <Text style={styles.emptyBody}>Create a task or choose one from the queue.</Text>
            </View>
          )}
        </View>
      </View>

      <Modal transparent visible={showCreateTask} animationType="fade" onRequestClose={() => setShowCreateTask(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create task</Text>
            <TextInput style={styles.modalInput} value={taskTitle} onChangeText={setTaskTitle} placeholder="Task title" placeholderTextColor="#6b7d9a" />
            <TextInput style={styles.modalInput} value={taskContextLink} onChangeText={setTaskContextLink} placeholder="Context link" placeholderTextColor="#6b7d9a" />
            <TextInput style={styles.modalInput} value={taskUrgency} onChangeText={setTaskUrgency} placeholder="Urgency 1-5" placeholderTextColor="#6b7d9a" />
            <ChoiceGroup
              label="Assigned To"
              value={taskAssignee}
              onChange={(value) => setTaskAssignee(value as "ai" | "human")}
              options={[
                { label: "AI", value: "ai" },
                { label: "Human", value: "human" },
              ]}
            />
            <ChoiceGroup
              label="Runs On"
              value={taskRuntime}
              onChange={setTaskRuntime}
              options={runtimeOptions()}
            />
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
              <Pressable style={styles.secondaryButton} onPress={() => setShowCreateTask(false)}>
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void createTask()}>
                <Text style={styles.primaryButtonLabel}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showCreateWorkspace} animationType="fade" onRequestClose={() => setShowCreateWorkspace(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create workspace</Text>
            <TextInput style={styles.modalInput} value={workspaceName} onChangeText={setWorkspaceName} placeholder="Workspace name" placeholderTextColor="#6b7d9a" />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setShowCreateWorkspace(false)}>
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void createWorkspace()}>
                <Text style={styles.primaryButtonLabel}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: "#08111d",
  },
  shell: {
    flex: 1,
    flexDirection: "row",
  },
  shellColumn: {
    flexDirection: "column",
  },
  sidebar: {
    width: 390,
    borderRightWidth: 1,
    borderRightColor: "rgba(111, 137, 172, 0.16)",
    padding: 20,
    gap: 18,
    backgroundColor: "#0d1726",
  },
  sidebarColumn: {
    width: "100%",
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(111, 137, 172, 0.16)",
  },
  detailPane: {
    flex: 1,
    padding: 24,
  },
  detailContent: {
    gap: 18,
    paddingBottom: 64,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandCopy: {
    flex: 1,
  },
  brandTitle: {
    color: "#eef4ff",
    fontSize: 18,
    fontWeight: "700",
  },
  brandSubtitle: {
    color: "#8fa2c0",
    fontSize: 12,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(111, 137, 172, 0.12)",
  },
  errorText: {
    color: "#ff99a4",
    fontSize: 12,
    lineHeight: 18,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: "#eef4ff",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  textButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(111, 137, 172, 0.12)",
  },
  textButtonLabel: {
    color: "#dbe5f4",
    fontSize: 12,
    fontWeight: "700",
  },
  workspaceList: {
    maxHeight: 190,
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.18)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: "#eef4ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    color: "#8fa2c0",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  taskList: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  taskTitle: {
    flex: 1,
    color: "#f7fbff",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaCard: {
    width: 190,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    gap: 6,
  },
  metaLabel: {
    color: "#8fa2c0",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaValue: {
    color: "#eef4ff",
    fontSize: 15,
    fontWeight: "600",
  },
  bannerStack: {
    gap: 10,
  },
  bannerCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(0, 209, 156, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(0, 209, 156, 0.16)",
  },
  warningCard: {
    backgroundColor: "rgba(255, 182, 72, 0.12)",
    borderColor: "rgba(255, 182, 72, 0.18)",
  },
  bannerTitle: {
    color: "#f7fbff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  bannerBody: {
    color: "#c7d6eb",
    fontSize: 13,
    lineHeight: 19,
  },
  contextLinkCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    gap: 6,
  },
  contextLinkLabel: {
    color: "#8fa2c0",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  contextLinkValue: {
    color: "#80dff4",
    fontSize: 14,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(111, 137, 172, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.14)",
  },
  statusButtonActive: {
    backgroundColor: "rgba(0, 209, 156, 0.14)",
    borderColor: "rgba(0, 209, 156, 0.22)",
  },
  statusButtonLabel: {
    color: "#dbe5f4",
    fontSize: 13,
    fontWeight: "700",
  },
  statusButtonLabelActive: {
    color: "#f7fbff",
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(111, 137, 172, 0.10)",
  },
  tabButtonActive: {
    backgroundColor: "#dfead1",
  },
  tabButtonLabel: {
    color: "#dbe5f4",
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonLabelActive: {
    color: "#1f3424",
  },
  stack: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 8,
  },
  feedCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  feedCardTitle: {
    flex: 1,
    color: "#eef4ff",
    fontSize: 15,
    fontWeight: "700",
  },
  feedTimestamp: {
    color: "#8fa2c0",
    fontSize: 11,
  },
  feedBody: {
    color: "#dbe5f4",
    fontSize: 14,
    lineHeight: 21,
  },
  feedMeta: {
    color: "#8fa2c0",
    fontSize: 12,
  },
  payloadText: {
    color: "#b8cae1",
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  composerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 12,
  },
  noteInput: {
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.18)",
    backgroundColor: "rgba(6, 12, 20, 0.28)",
    color: "#eef4ff",
    padding: 12,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#dfead1",
  },
  primaryButtonLabel: {
    color: "#1f3424",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(111, 137, 172, 0.12)",
  },
  secondaryButtonLabel: {
    color: "#dbe5f4",
    fontSize: 13,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 8, 15, 0.66)",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "#0d1726",
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    color: "#f7fbff",
    fontSize: 20,
    fontWeight: "800",
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.18)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: "#eef4ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  emptyShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#08111d",
    padding: 24,
  },
  emptyCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(111, 137, 172, 0.16)",
    backgroundColor: "#0d1726",
    padding: 28,
    gap: 12,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#f7fbff",
    fontSize: 22,
    fontWeight: "800",
  },
  emptyBody: {
    color: "#c7d6eb",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
});
