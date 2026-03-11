import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { seedComments, seedTasks, seedWorkspaces } from "./src/mockData";
import type { Actor, Comment, Task, TaskStatus, WorkspaceSummary } from "./src/types";

interface WireTask {
  Task_ID: string;
  Title: string;
  Status: string;
  Created_By: string;
  Assignee: string;
  Context_Link?: string | null;
  AI_Urgency?: number;
  Input_Request?: Record<string, unknown> | null;
  Input_Response?: Record<string, unknown> | null;
  Worker_ID?: string | null;
  Claimed_At?: string | null;
  Updated_At?: string;
}

interface WireComment {
  Comment_ID: string;
  Task_ID: string;
  Author: string;
  Message: string;
  Type: string;
  Timestamp: string;
  Attachment_Link?: string | null;
  Metadata?: Record<string, unknown> | null;
}

interface WireWorkspace {
  name: string;
  provider?: string;
  store?: string;
  active?: boolean;
}

interface UploadDraft {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

interface DemoWorkspaceRecord {
  summary: WorkspaceSummary;
  tasks: Task[];
  comments: Comment[];
}

interface TaskDraft {
  title: string;
  status: TaskStatus;
  createdBy: Actor;
  assignee: Actor;
  aiUrgency: number;
  contextLink: string;
}

interface ChoiceOption {
  label: string;
  value: string;
}

type ActivityView = "comments" | "logs";

function workspaceAccent(name: string): string {
  const palette = ["#f97316", "#10b981", "#38bdf8", "#f59e0b", "#e879f9", "#22c55e"];
  const hash = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? "#f97316";
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function shortHash(value?: string): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 20) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function looksLikeUrl(value?: string): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatMetadataJson(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return null;
  }
}

function normalizeStatus(raw: string): TaskStatus {
  if (raw === "In Progress") {
    return "In Progress";
  }
  if (raw === "Blocked") {
    return "Blocked";
  }
  if (raw === "Done") {
    return "Done";
  }
  return "Pending";
}

function statusToWire(status: TaskStatus): string {
  if (status === "In Progress") {
    return "in_progress";
  }
  return status.toLowerCase();
}

function normalizeActor(raw: string): Actor {
  return raw.toLowerCase() === "ai" ? "AI" : "Human";
}

function toTask(wire: WireTask): Task {
  return {
    id: wire.Task_ID,
    title: wire.Title,
    status: normalizeStatus(wire.Status),
    createdBy: normalizeActor(wire.Created_By),
    assignee: normalizeActor(wire.Assignee),
    contextLink: wire.Context_Link ?? undefined,
    aiUrgency: wire.AI_Urgency,
    inputRequest: (wire.Input_Request as Task["inputRequest"]) ?? null,
    inputResponse: wire.Input_Response ?? null,
    workerId: wire.Worker_ID ?? undefined,
    claimedAt: wire.Claimed_At ?? undefined,
    updatedAt: wire.Updated_At ?? new Date().toISOString()
  };
}

function toComment(wire: WireComment): Comment {
  const typeMapping: Record<string, Comment["type"]> = {
    message: "message",
    log: "log",
    decision: "decision",
    attachment: "attachment"
  };

  const rawType = wire.Type.toLowerCase();
  const metadata = wire.Metadata ?? null;
  return {
    id: wire.Comment_ID,
    taskId: wire.Task_ID,
    author: normalizeActor(wire.Author),
    message: wire.Message,
    type: typeMapping[rawType] ?? "message",
    timestamp: wire.Timestamp,
    attachmentLink: wire.Attachment_Link ?? undefined,
    metadata,
    attachmentMeta:
      rawType === "attachment" || Boolean(wire.Attachment_Link)
        ? ((metadata as Comment["attachmentMeta"]) ?? undefined)
        : undefined
  };
}

function toWorkspace(wire: WireWorkspace): WorkspaceSummary {
  return {
    name: wire.name,
    provider: wire.provider,
    store: wire.store,
    active: Boolean(wire.active)
  };
}

function createTaskDraft(task: Task | null): TaskDraft {
  return {
    title: task?.title ?? "",
    status: task?.status ?? "Pending",
    createdBy: task?.createdBy ?? "Human",
    assignee: task?.assignee ?? "AI",
    aiUrgency: task?.aiUrgency ?? 3,
    contextLink: task?.contextLink ?? ""
  };
}

function sortTasks(tasks: Task[]): Task[] {
  const statusRank: Record<TaskStatus, number> = {
    Blocked: 0,
    "In Progress": 1,
    Pending: 2,
    Done: 3
  };

  return [...tasks].sort((left, right) => {
    const rankDelta = statusRank[left.status] - statusRank[right.status];
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function statusBadgeVariant(status: TaskStatus) {
  if (status === "Blocked") {
    return styles.statusBlocked;
  }
  if (status === "In Progress") {
    return styles.statusInProgress;
  }
  if (status === "Done") {
    return styles.statusDone;
  }
  return styles.statusPending;
}

function pickFileForUpload(): Promise<UploadDraft | null> {
  if (Platform.OS !== "web") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      resolve(null);
      return;
    }

    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,text/plain,text/csv,.txt,.csv";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          data_base64: base64
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function buildDemoWorkspaces(): DemoWorkspaceRecord[] {
  const secondTask: Task = {
    id: "task-seed-3",
    title: "Draft launch narrative for concierge automation",
    status: "Pending",
    createdBy: "Human",
    assignee: "AI",
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

function LogoMark() {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoMarkRingOuter} />
      <View style={styles.logoMarkRingInner} />
      <View style={styles.logoMarkCore} />
    </View>
  );
}

function WorkspaceCard(props: {
  workspace: WorkspaceSummary;
  isSelected: boolean;
  collapsed?: boolean;
  canDelete?: boolean;
  busy?: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const { workspace, isSelected, collapsed = false, canDelete = false, busy = false, onPress, onDelete } = props;
  const summary = isSelected
    ? "Current lane"
    : workspace.provider === "local_json"
      ? "Local workspace"
      : "Workspace";
  const accent = workspaceAccent(workspace.name);
  return (
    <View
      style={[
        styles.workspaceCard,
        isSelected ? styles.workspaceCardActive : null,
        collapsed ? styles.workspaceCardCollapsed : null
      ]}
    >
      <Pressable style={styles.workspaceCardPressable} onPress={onPress}>
        <View
          style={[
            styles.workspaceGlyph,
            isSelected ? styles.workspaceGlyphActive : null,
            { borderColor: `${accent}55` }
          ]}
        >
          <View style={[styles.workspaceGlyphDot, { backgroundColor: accent }]} />
        </View>
        {!collapsed ? (
          <View style={styles.workspaceCardBody}>
            <View style={styles.workspaceCardTop}>
              <Text style={styles.workspaceName}>{workspace.name}</Text>
              <View style={[styles.workspaceStatePill, workspace.active ? styles.workspaceStatePillActive : null]}>
                <Text style={styles.workspaceStateText}>{workspace.active ? "Live" : "Idle"}</Text>
              </View>
            </View>
            <Text style={styles.workspaceStore} numberOfLines={1}>
              {summary}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {!collapsed && canDelete && onDelete ? (
        <Pressable
          style={[styles.workspaceDeleteButton, busy ? styles.buttonDisabled : null]}
          onPress={() => onDelete()}
          disabled={busy}
        >
          <Feather name="trash-2" size={14} color="#8f98ad" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ChoiceGroup(props: {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { label, options, value, onChange } = props;
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.choicePill, option.value === value ? styles.choicePillActive : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.choiceLabel, option.value === value ? styles.choiceLabelActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FilterChip(props: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { label, active, onPress } = props;
  return (
    <Pressable style={[styles.filterChip, active ? styles.filterChipActive : null]} onPress={onPress}>
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function SideRailItem(props: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const { label, value, accent = false } = props;
  return (
    <View style={styles.sideRailItem}>
      <Text style={styles.sideRailLabel}>{label}</Text>
      <Text style={[styles.sideRailValue, accent ? styles.sideRailValueAccent : null]}>{value}</Text>
    </View>
  );
}

function TaskListItem(props: {
  task: Task;
  selected: boolean;
  busy?: boolean;
  onPress: () => void;
  onToggleDone: () => void;
}) {
  const { task, selected, busy = false, onPress, onToggleDone } = props;
  const strike = task.status === "Done";
  return (
    <View style={[styles.taskCard, selected ? styles.taskCardSelected : null]}>
      <Pressable
        style={[styles.taskCheckButton, strike ? styles.taskCheckButtonDone : null, busy ? styles.buttonDisabled : null]}
        onPress={onToggleDone}
        disabled={busy}
      >
        <Feather name={strike ? "check-circle" : "circle"} size={18} color={strike ? "#9fb0c7" : "#dbe1ec"} />
      </Pressable>
      <Pressable style={styles.taskCardBody} onPress={onPress}>
        <View style={styles.taskCardHeader}>
          <Text
            style={[
              styles.taskCardTitle,
              strike ? styles.taskCardTitleDone : null
            ]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.inputRequest ? <Text style={styles.taskBlockedHint}>Input</Text> : null}
        </View>
        <View style={styles.taskMetaRow}>
          <Text style={styles.taskCardMeta}>
            {task.assignee} · {task.status}
          </Text>
          <Text style={styles.taskTimestamp}>{formatTimestamp(task.updatedAt)}</Text>
        </View>
        <Text style={styles.taskUrgency}>Urgency {task.aiUrgency ?? 3}/5</Text>
      </Pressable>
    </View>
  );
}

function AttachmentVideoPreview(props: { uri: string; mimeType?: string }) {
  const { uri, mimeType } = props;
  if (Platform.OS !== "web") {
    return <Text style={styles.attachmentMeta}>Video preview is available on web. Use Open Attachment.</Text>;
  }

  return (
    <View style={styles.videoFrame}>
      {React.createElement(
        "video",
        {
          controls: true,
          preload: "metadata",
          style: {
            width: "100%",
            height: "100%",
            borderRadius: 18,
            backgroundColor: "#081018"
          }
        },
        React.createElement("source", {
          src: uri,
          type: mimeType || "video/mp4"
        })
      )}
    </View>
  );
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
  const [showCommentComposer, setShowCommentComposer] = useState(false);
  const [activityView, setActivityView] = useState<ActivityView>("comments");
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);
  const taskContextInputRef = useRef<TextInput>(null);

  const sharedApiUrl = (process.env.EXPO_PUBLIC_LOCAL_API_URL ?? "").trim();
  const uploadLimitMbRaw = Number(process.env.EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB ?? "25");
  const uploadLimitMb = Number.isFinite(uploadLimitMbRaw) && uploadLimitMbRaw > 0 ? uploadLimitMbRaw : 25;
  const uploadLimitBytes = Math.round(uploadLimitMb * 1024 * 1024);
  const sharedMode = Boolean(sharedApiUrl);
  const collapsedSidebar = sidebarCollapsed && !singleColumn;

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

  const taskDraftDirty = useMemo(() => {
    if (!selectedTask) {
      return false;
    }
    return (
      taskDraft.title !== selectedTask.title ||
      taskDraft.status !== selectedTask.status ||
      taskDraft.createdBy !== selectedTask.createdBy ||
      taskDraft.assignee !== selectedTask.assignee ||
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
    setShowCommentComposer(false);
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

  const selectedTaskDisplayTitle = taskDraft.title.trim() || selectedTask?.title || "Untitled task";
  const selectedTaskContextValue = taskDraft.contextLink.trim();
  const selectedTaskContextIsUrl = looksLikeUrl(selectedTaskContextValue);
  const selectedTaskContextNote =
    selectedTaskContextValue && !selectedTaskContextIsUrl ? selectedTaskContextValue : null;
  const contextEditorLocationLabel = singleColumn ? "below" : "on the right";

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
                  <Feather name={collapsedSidebar ? "chevrons-right" : "chevrons-left"} size={16} color="#cfd5e3" />
                </Pressable>
              </View>

              <View style={styles.sidebarActionStack}>
                <Pressable style={styles.sidebarPrimaryAction} onPress={() => setShowCreateTask(true)}>
                  <Feather name="plus-circle" size={16} color="#ff8a78" />
                  {!collapsedSidebar ? <Text style={styles.sidebarPrimaryActionText}>Add task</Text> : null}
                </Pressable>
                <Pressable style={styles.sidebarSecondaryAction} onPress={() => setShowWorkspaceCreator(true)}>
                  <Feather name="folder-plus" size={16} color="#cfd5e3" />
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
                        <Text style={styles.headerStatValue}>{blockedCount}</Text>
                        <Text style={styles.headerStatLabel}>blocked</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.mainHeaderActions}>
                    <Pressable style={styles.toolbarButton} onPress={() => setShowQueueFilters((current) => !current)}>
                      <Feather name="sliders" size={14} color="#dbe1ec" />
                      <Text style={styles.toolbarButtonText}>{showQueueFilters ? "Hide filters" : "Filters"}</Text>
                    </Pressable>
                    <Pressable style={styles.toolbarButton} onPress={() => void refreshAll()} disabled={refreshing || !sharedMode}>
                      <Feather name="rotate-cw" size={14} color="#dbe1ec" />
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
                  placeholderTextColor="#7a8090"
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
                      <Text style={styles.emptyStateTitle}>No tasks</Text>
                      <Text style={styles.emptyStateText}>Create one from the sidebar and it will show up here.</Text>
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
                      <Text style={styles.drawerWorkspaceMeta}>
                        {activityView === "comments" ? `${noteComments.length} comments` : `${logComments.length} logs`}
                      </Text>
                    </View>

                    <View style={styles.drawerHeaderActions}>
                      <Pressable
                        style={[styles.summaryActionPill, statusUpdatingTaskId === selectedTask.id ? styles.buttonDisabled : null]}
                        onPress={() => void updateTaskStatus(selectedTask, selectedTask.status === "Done" ? "Pending" : "Done")}
                        disabled={statusUpdatingTaskId === selectedTask.id}
                      >
                        <Feather name={selectedTask.status === "Done" ? "rotate-ccw" : "check"} size={13} color="#dbe1ec" />
                        <Text style={styles.summaryActionPillText}>
                          {statusUpdatingTaskId === selectedTask.id
                            ? "Saving"
                            : selectedTask.status === "Done"
                              ? "Reopen"
                              : "Mark done"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.toolbarButton, taskDeleting ? styles.buttonDisabled : null]}
                        onPress={() => setTaskDeleteTarget(selectedTask)}
                        disabled={taskDeleting}
                      >
                        <Feather name="trash-2" size={14} color="#fca5a5" />
                        <Text style={styles.toolbarDangerText}>Delete</Text>
                      </Pressable>
                      <Pressable style={styles.iconButton} onPress={closeTaskDrawer}>
                        <Feather name="x" size={16} color="#cfd5e3" />
                      </Pressable>
                    </View>
                  </View>

                  <View style={[styles.taskWorkspaceLayout, singleColumn ? styles.taskWorkspaceLayoutSingle : null]}>
                    <View style={styles.taskWorkspaceMain}>
                      <ScrollView
                        style={styles.taskWorkspaceMainScroll}
                        contentContainerStyle={styles.taskWorkspaceMainContent}
                        showsVerticalScrollIndicator={false}
                      >
                        <View style={styles.taskHero}>
                          <View style={styles.taskHeroRow}>
                            <View style={styles.taskHeroCheck}>
                              <Feather
                                name={selectedTask.status === "Done" ? "check-circle" : "circle"}
                                size={28}
                                color={selectedTask.status === "Done" ? "#9fb0c7" : "#dbe1ec"}
                              />
                            </View>
                            <View style={styles.taskHeroBody}>
                              <Text style={styles.taskHeroTitle}>{selectedTaskDisplayTitle}</Text>
                              {selectedTaskContextNote ? (
                                <Text style={styles.taskHeroDescription}>{selectedTaskContextNote}</Text>
                              ) : selectedTaskContextIsUrl ? (
                                <Pressable
                                  style={styles.taskHeroLink}
                                  onPress={() => void openLink(selectedTaskContextValue)}
                                >
                                  <Feather name="external-link" size={15} color="#dbe1ec" />
                                  <Text style={styles.taskHeroLinkText}>Open context link</Text>
                                </Pressable>
                              ) : (
                                <View style={styles.taskHeroPlaceholderCard}>
                                  <Text style={styles.taskHeroPlaceholderTitle}>No context yet</Text>
                                  <Text style={styles.taskHeroPlaceholder}>
                                    Add a context note or URL in the editor {contextEditorLocationLabel} to sharpen the
                                    task for both human and AI.
                                  </Text>
                                  <Pressable
                                    style={styles.quietButton}
                                    onPress={() => {
                                      taskContextInputRef.current?.focus();
                                    }}
                                  >
                                    <Text style={styles.quietButtonText}>Add context</Text>
                                  </Pressable>
                                </View>
                              )}
                            </View>
                          </View>

                          <View style={styles.summaryPills}>
                            <View style={styles.summaryPill}>
                              <Text style={styles.summaryPillText}>{taskDraft.status}</Text>
                            </View>
                            <View style={styles.summaryPillMuted}>
                              <Text style={styles.summaryPillMutedText}>{taskDraft.assignee} lane</Text>
                            </View>
                            <View style={styles.summaryPillMuted}>
                              <Text style={styles.summaryPillMutedText}>Urgency {taskDraft.aiUrgency}/5</Text>
                            </View>
                            {selectedTask.workerId ? (
                              <View style={styles.summaryPillMuted}>
                                <Text style={styles.summaryPillMutedText}>{selectedTask.workerId}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        {selectedTask.status === "Blocked" && selectedTask.inputRequest ? (
                          <View style={styles.blockerShell}>
                            <BlockerCard
                              inputRequest={selectedTask.inputRequest}
                              onSubmit={(payload) => {
                                void resolveInput(payload);
                              }}
                            />
                          </View>
                        ) : null}

                        <View style={styles.activityTabsRow}>
                          <View style={styles.activityTabs}>
                            <Pressable
                              style={[styles.activityTab, activityView === "comments" ? styles.activityTabActive : null]}
                              onPress={() => setActivityView("comments")}
                            >
                              <Text
                                style={[
                                  styles.activityTabText,
                                  activityView === "comments" ? styles.activityTabTextActive : null
                                ]}
                              >
                                Comments
                              </Text>
                              <Text
                                style={[
                                  styles.activityTabCount,
                                  activityView === "comments" ? styles.activityTabCountActive : null
                                ]}
                              >
                                {noteComments.length}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.activityTab, activityView === "logs" ? styles.activityTabActive : null]}
                              onPress={() => setActivityView("logs")}
                            >
                              <Text
                                style={[
                                  styles.activityTabText,
                                  activityView === "logs" ? styles.activityTabTextActive : null
                                ]}
                              >
                                Logs
                              </Text>
                              <Text
                                style={[
                                  styles.activityTabCount,
                                  activityView === "logs" ? styles.activityTabCountActive : null
                                ]}
                              >
                                {logComments.length}
                              </Text>
                            </Pressable>
                          </View>
                          <Text style={styles.activityCaption}>
                            {activityView === "comments"
                              ? "Human-useful notes, decisions, and artifacts"
                              : "Verbose AI trace, payloads, and autonomous ping-pong"}
                          </Text>
                        </View>

                        <View style={styles.commentStack}>
                          {(activityView === "comments" ? noteComments : logComments).length ? (
                            (activityView === "comments" ? noteComments : logComments).map((comment) => {
                              const rawMetadata = formatMetadataJson(comment.metadata);
                              const showPayload = expandedLogIds.includes(comment.id);

                              return (
                                <View key={comment.id} style={styles.commentCard}>
                                  <View style={styles.commentHeader}>
                                    <View
                                      style={[
                                        styles.authorBadge,
                                        comment.author === "AI" ? styles.authorBadgeAi : styles.authorBadgeHuman
                                      ]}
                                    >
                                      <Text style={styles.authorBadgeText}>{comment.author}</Text>
                                    </View>
                                    <Text style={styles.commentType}>{comment.type}</Text>
                                    <Text style={styles.commentTimestamp}>{formatTimestamp(comment.timestamp)}</Text>
                                  </View>
                                  <Text style={styles.commentBody}>{comment.message}</Text>

                                  {comment.attachmentLink ? (
                                    <View style={styles.attachmentCard}>
                                      <Text style={styles.attachmentTitle}>
                                        {comment.attachmentMeta?.filename ?? comment.attachmentLink}
                                      </Text>
                                      <Text style={styles.attachmentMeta}>
                                        {(comment.attachmentMeta?.mime_type ?? "application/octet-stream").toLowerCase()} ·{" "}
                                        {formatBytes(comment.attachmentMeta?.size_bytes)}
                                      </Text>
                                      {comment.attachmentMeta?.uploaded_at ? (
                                        <Text style={styles.attachmentMeta}>
                                          Uploaded {formatTimestamp(comment.attachmentMeta.uploaded_at)}
                                        </Text>
                                      ) : null}
                                      {comment.attachmentMeta?.sha256 ? (
                                        <Text style={styles.attachmentMeta}>SHA256 {shortHash(comment.attachmentMeta.sha256)}</Text>
                                      ) : null}
                                      {comment.attachmentMeta?.kind === "image" ? (
                                        <Image source={{ uri: comment.attachmentLink }} style={styles.attachmentImage as ImageStyle} />
                                      ) : null}
                                      {comment.attachmentMeta?.kind === "video" ? (
                                        <AttachmentVideoPreview
                                          uri={comment.attachmentLink}
                                          mimeType={comment.attachmentMeta?.mime_type}
                                        />
                                      ) : null}
                                      {comment.attachmentMeta?.preview_text ? (
                                        <View style={styles.previewCard}>
                                          <Text style={styles.previewLabel}>Preview</Text>
                                          <Text style={styles.previewText}>{comment.attachmentMeta.preview_text}</Text>
                                        </View>
                                      ) : null}
                                      <Pressable
                                        style={styles.toolbarButton}
                                        onPress={() => void openLink(comment.attachmentLink ?? "")}
                                      >
                                        <Feather name="external-link" size={14} color="#dbe1ec" />
                                        <Text style={styles.toolbarButtonText}>Open attachment</Text>
                                      </Pressable>
                                    </View>
                                  ) : null}

                                  {activityView === "logs" && rawMetadata ? (
                                    <View style={styles.logPayloadCard}>
                                      <View style={styles.logPayloadHeader}>
                                        <Text style={styles.previewLabel}>Payload</Text>
                                        <Pressable style={styles.quietButton} onPress={() => toggleLogPayload(comment.id)}>
                                          <Text style={styles.quietButtonText}>{showPayload ? "Hide raw" : "Show raw"}</Text>
                                        </Pressable>
                                      </View>
                                      {showPayload ? <Text style={styles.logPayloadText}>{rawMetadata}</Text> : null}
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })
                          ) : (
                            <View style={styles.emptyStateCard}>
                              <Text style={styles.emptyStateTitle}>
                                {activityView === "comments" ? "No comments yet" : "No logs yet"}
                              </Text>
                              <Text style={styles.emptyStateText}>
                                {activityView === "comments"
                                  ? "Human-facing notes, decisions, and artifacts will appear here."
                                  : "Detailed AI execution logs and payloads will appear here."}
                              </Text>
                            </View>
                          )}
                        </View>
                      </ScrollView>

                      {activityView === "comments" ? (
                        <View style={styles.composerDock}>
                          {uploadDraft ? (
                            <Text style={styles.uploadHint}>
                              Selected: {uploadDraft.filename} ({formatBytes(uploadDraft.size_bytes)})
                            </Text>
                          ) : null}
                          {uploadError ? <Text style={styles.inlineError}>{uploadError}</Text> : null}
                          <View style={styles.composerDockRow}>
                            <View style={styles.composerAvatar}>
                              <Feather name="user" size={18} color="#f8fafc" />
                            </View>
                            <View style={styles.composerInputShell}>
                              <TextInput
                                style={styles.composerInput}
                                value={commentDraft}
                                onChangeText={setCommentDraft}
                                placeholder="Add comment"
                                placeholderTextColor="#7d8597"
                                multiline
                              />
                              <View style={styles.composerActions}>
                                <Pressable style={styles.composerIconButton} onPress={() => void attachFile()}>
                                  <Feather name="paperclip" size={16} color="#cfd5e3" />
                                </Pressable>
                                <Pressable
                                  style={[styles.composerSubmitButton, commentSubmitting ? styles.buttonDisabled : null]}
                                  onPress={() => void addComment()}
                                  disabled={commentSubmitting}
                                >
                                  <Feather name="arrow-up" size={15} color="#f8fafc" />
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.composerDockMuted}>
                          <Text style={styles.composerDockMutedText}>
                            Logs are read-only here. Switch back to Comments to add a human note or attachment.
                          </Text>
                        </View>
                      )}
                    </View>

                    <ScrollView
                      style={[styles.taskWorkspaceSideRail, singleColumn ? styles.taskWorkspaceSideRailSingle : null]}
                      contentContainerStyle={styles.taskWorkspaceSideRailContent}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.sideRailCard}>
                        <View style={styles.sideRailCardHeader}>
                          <Text style={styles.sideRailTitle}>Edit task</Text>
                          {taskDraftDirty ? (
                            <View style={styles.sideRailDirtyPill}>
                              <Text style={styles.sideRailDirtyPillText}>Unsaved</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.sideRailHelpText}>Update the task title, context, routing, and urgency here.</Text>
                        <TextInput
                          style={[styles.input, styles.sideRailTitleInput]}
                          value={taskDraft.title}
                          onChangeText={(value) => setTaskDraft((current) => ({ ...current, title: value }))}
                          placeholder="Task title"
                          placeholderTextColor="#7d8597"
                        />
                        <TextInput
                          ref={taskContextInputRef}
                          style={[styles.input, styles.sideRailContextInput]}
                          value={taskDraft.contextLink}
                          onChangeText={(value) => setTaskDraft((current) => ({ ...current, contextLink: value }))}
                          placeholder="Context note or URL"
                          placeholderTextColor="#7d8597"
                          multiline
                        />
                        <View style={styles.compactControlsRow}>
                          <ChoiceGroup
                            label="Status"
                            value={taskDraft.status}
                            onChange={(value) => setTaskDraft((current) => ({ ...current, status: value as TaskStatus }))}
                            options={[
                              { label: "Pending", value: "Pending" },
                              { label: "In Progress", value: "In Progress" },
                              { label: "Blocked", value: "Blocked" },
                              { label: "Done", value: "Done" }
                            ]}
                          />
                          <ChoiceGroup
                            label="Created By"
                            value={taskDraft.createdBy}
                            onChange={(value) => setTaskDraft((current) => ({ ...current, createdBy: value as Actor }))}
                            options={[
                              { label: "Human", value: "Human" },
                              { label: "AI", value: "AI" }
                            ]}
                          />
                          <ChoiceGroup
                            label="Assignee"
                            value={taskDraft.assignee}
                            onChange={(value) => setTaskDraft((current) => ({ ...current, assignee: value as Actor }))}
                            options={[
                              { label: "Human", value: "Human" },
                              { label: "AI", value: "AI" }
                            ]}
                          />
                          <ChoiceGroup
                            label="Urgency"
                            value={String(taskDraft.aiUrgency)}
                            onChange={(value) => setTaskDraft((current) => ({ ...current, aiUrgency: Number(value) }))}
                            options={[1, 2, 3, 4, 5].map((value) => ({ label: `${value}`, value: String(value) }))}
                          />
                        </View>
                        <View style={styles.sideRailActionRow}>
                          <Pressable
                            style={[styles.quietButton, !taskDraftDirty || taskSaving ? styles.buttonDisabled : null]}
                            onPress={() => setTaskDraft(createTaskDraft(selectedTask))}
                            disabled={!taskDraftDirty || taskSaving}
                          >
                            <Text style={styles.quietButtonText}>Reset</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.primaryButtonSmall, !taskDraftDirty || taskSaving ? styles.buttonDisabled : null]}
                            onPress={() => void saveTaskConfig()}
                            disabled={!taskDraftDirty || taskSaving}
                          >
                            <Text style={styles.primaryButtonText}>{taskSaving ? "Saving..." : "Save Changes"}</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.sideRailCard}>
                        <Text style={styles.sideRailTitle}>Task properties</Text>
                        <SideRailItem label="Workspace" value={activeWorkspace?.name ?? "Current workspace"} />
                        <SideRailItem label="Status" value={selectedTask.status} accent={selectedTask.status === "Blocked"} />
                        <SideRailItem label="Assignee" value={selectedTask.assignee} />
                        <SideRailItem label="Created by" value={selectedTask.createdBy} />
                        <SideRailItem label="Urgency" value={`${selectedTask.aiUrgency ?? 3}/5`} />
                        <SideRailItem label="Updated" value={formatTimestamp(selectedTask.updatedAt)} />
                        {selectedTask.workerId ? <SideRailItem label="Worker" value={selectedTask.workerId} /> : null}
                        {selectedTask.claimedAt ? <SideRailItem label="Claimed" value={formatTimestamp(selectedTask.claimedAt)} /> : null}
                        {selectedTask.contextLink && looksLikeUrl(selectedTask.contextLink) ? (
                          <View style={styles.sideRailItem}>
                            <Text style={styles.sideRailLabel}>Context</Text>
                            <Pressable style={styles.sideRailLink} onPress={() => void openLink(selectedTask.contextLink ?? "")}>
                              <Feather name="external-link" size={14} color="#dbe1ec" />
                              <Text style={styles.sideRailLinkText}>Open link</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </ScrollView>
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
                    <Feather name="x" size={16} color="#cfd5e3" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <TextInput
                    style={styles.modalTitleInput}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Task name"
                    placeholderTextColor="#6b7280"
                  />
                  <TextInput
                    style={styles.modalTextInput}
                    value={newContextLink}
                    onChangeText={setNewContextLink}
                    placeholder="Context link or description"
                    placeholderTextColor="#6b7280"
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
                    <Feather name="x" size={16} color="#cfd5e3" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <TextInput
                    style={styles.modalTextInput}
                    value={workspaceDraft}
                    onChangeText={setWorkspaceDraft}
                    placeholder="Workspace name"
                    placeholderTextColor="#6b7280"
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
                    <Feather name="x" size={16} color="#cfd5e3" />
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
                    <Feather name="x" size={16} color="#cfd5e3" />
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b0d12"
  },
  workspaceBg: {
    flex: 1,
    backgroundColor: "#0b0d12"
  },
  container: {
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16
  },
  errorBanner: {
    borderRadius: 16,
    backgroundColor: "rgba(127, 29, 29, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.28)",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  errorBannerText: {
    color: "#fecaca",
    fontWeight: "700"
  },
  workspaceShell: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 820,
    backgroundColor: "#121419",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden"
  },
  workspaceShellSingle: {
    flexDirection: "column"
  },
  sidebarPanel: {
    width: 320,
    backgroundColor: "#111318",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
    padding: 18,
    gap: 16
  },
  sidebarPanelSingle: {
    width: "100%"
  },
  sidebarPanelCollapsed: {
    width: 96,
    paddingHorizontal: 12
  },
  sidebarTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#151922",
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  logoMarkRingOuter: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(249, 115, 22, 0.55)"
  },
  logoMarkRingInner: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.75)"
  },
  logoMarkCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#f8fafc"
  },
  accountCopy: {
    gap: 2,
    minWidth: 0
  },
  accountName: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700"
  },
  accountSubtle: {
    color: "#8b92a6",
    fontSize: 12
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  sidebarActionStack: {
    gap: 10
  },
  sidebarPrimaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "rgba(234, 96, 81, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(234, 96, 81, 0.28)",
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  sidebarPrimaryActionText: {
    color: "#ff8a78",
    fontSize: 16,
    fontWeight: "700"
  },
  sidebarSecondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  sidebarSecondaryActionText: {
    color: "#cfd5e3",
    fontSize: 15,
    fontWeight: "700"
  },
  sidebarSectionTitle: {
    color: "#7d8597",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  workspaceStack: {
    gap: 8
  },
  workspaceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent"
  },
  workspaceCardPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  workspaceCardActive: {
    backgroundColor: "rgba(122, 50, 43, 0.55)",
    borderColor: "rgba(255,255,255,0.06)"
  },
  workspaceCardCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 10
  },
  workspaceGlyph: {
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  workspaceGlyphActive: {
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  workspaceGlyphDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  workspaceCardBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  workspaceCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  workspaceName: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  },
  workspaceStatePill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  workspaceStatePillActive: {
    backgroundColor: "#0f766e"
  },
  workspaceStateText: {
    color: "#f8fafc",
    fontSize: 10,
    fontWeight: "800"
  },
  workspaceStore: {
    color: "#8b92a6",
    fontSize: 12
  },
  workspaceDeleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
    padding: 24,
    gap: 18
  },
  mainPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)"
  },
  mainHeaderCopy: {
    gap: 8
  },
  mainBreadcrumb: {
    color: "#8b92a6",
    fontSize: 12,
    fontWeight: "700"
  },
  mainPanelTitle: {
    color: "#f8fafc",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800"
  },
  headerStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  headerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  headerStatValue: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  headerStatLabel: {
    color: "#8b92a6",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  mainHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  toolbarButtonText: {
    color: "#dbe1ec",
    fontSize: 13,
    fontWeight: "700"
  },
  toolbarDangerText: {
    color: "#fecaca",
    fontSize: 13,
    fontWeight: "700"
  },
  searchRow: {
    flexDirection: "row",
    paddingTop: 2
  },
  searchInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  filterBar: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14
  },
  filterSection: {
    gap: 8
  },
  filterLabel: {
    color: "#7d8597",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: "rgba(234, 96, 81, 0.18)",
    borderColor: "rgba(234, 96, 81, 0.32)"
  },
  filterChipText: {
    color: "#cfd5e3",
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: "#ffb2a8"
  },
  contentSplit: {
    gap: 18
  },
  taskListPane: {
    gap: 10,
    minWidth: 0,
    paddingBottom: 12
  },
  taskList: {
    gap: 10
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)"
  },
  taskCheckButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  taskCheckButtonDone: {
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  taskCardSelected: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(234, 96, 81, 0.18)",
    backgroundColor: "rgba(255,255,255,0.025)"
  },
  taskStatusOrb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "transparent"
  },
  statusPending: {
    backgroundColor: "transparent"
  },
  statusInProgress: {
    backgroundColor: "rgba(96, 165, 250, 0.78)",
    borderColor: "rgba(147, 197, 253, 0.80)"
  },
  statusBlocked: {
    backgroundColor: "rgba(248, 113, 113, 0.82)",
    borderColor: "rgba(252, 165, 165, 0.9)"
  },
  statusDone: {
    backgroundColor: "rgba(107, 114, 128, 0.85)",
    borderColor: "rgba(156, 163, 175, 0.9)"
  },
  taskCardBody: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  taskCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  taskCardTitle: {
    flex: 1,
    color: "#f8fafc",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "500"
  },
  taskCardTitleDone: {
    color: "#8b92a6",
    textDecorationLine: "line-through"
  },
  taskBlockedHint: {
    color: "#ff8a78",
    fontSize: 12,
    fontWeight: "800"
  },
  taskMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap"
  },
  taskCardMeta: {
    color: "#9ea6b8",
    fontSize: 13
  },
  taskTimestamp: {
    color: "#7d8597",
    fontSize: 12
  },
  taskUrgency: {
    color: "#cfd5e3",
    fontSize: 13
  },
  emptyStateCardCompact: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 8
  },
  detailPane: {
    gap: 16
  },
  detailHeaderCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0
  },
  detailPaneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)"
  },
  detailPanelTitle: {
    color: "#f8fafc",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800"
  },
  detailPanelMeta: {
    color: "#8b92a6",
    fontSize: 13
  },
  drawerScrim: {
    flex: 1,
    backgroundColor: "rgba(4, 6, 10, 0.72)",
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
    height: "88%",
    maxHeight: 940,
    backgroundColor: "#121419",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 32,
    shadowOffset: {
      width: 0,
      height: 12
    },
    elevation: 20
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
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#101217"
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
    color: "#7f879a",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  drawerWorkspaceDot: {
    color: "#5f6779",
    fontSize: 13,
    fontWeight: "700"
  },
  drawerWorkspaceMeta: {
    color: "#d8deea",
    fontSize: 14,
    fontWeight: "600"
  },
  drawerHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  drawerScrollContent: {
    padding: 20,
    paddingBottom: 36
  },
  taskWorkspaceLayout: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 0
  },
  taskWorkspaceLayoutSingle: {
    flexDirection: "column"
  },
  taskWorkspaceMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#121419"
  },
  taskWorkspaceMainScroll: {
    flex: 1
  },
  taskWorkspaceMainContent: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 22
  },
  taskWorkspaceSideRail: {
    width: 330,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#16191f"
  },
  taskWorkspaceSideRailContent: {
    padding: 24,
    gap: 16
  },
  taskWorkspaceSideRailSingle: {
    width: "100%",
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    maxHeight: 360
  },
  taskHero: {
    gap: 18
  },
  taskHeroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16
  },
  taskHeroCheck: {
    width: 36,
    alignItems: "center",
    paddingTop: 4
  },
  taskHeroBody: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  taskHeroTitle: {
    color: "#f8fafc",
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -0.7
  },
  taskHeroDescription: {
    color: "#b5bdd0",
    fontSize: 18,
    lineHeight: 28
  },
  taskHeroPlaceholder: {
    color: "#7d8597",
    fontSize: 17,
    lineHeight: 26
  },
  taskHeroPlaceholderCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 10,
    alignSelf: "flex-start",
    maxWidth: 520
  },
  taskHeroPlaceholderTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "800"
  },
  taskHeroLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  taskHeroLinkText: {
    color: "#dbe1ec",
    fontSize: 14,
    fontWeight: "700"
  },
  detailMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  summaryPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryPill: {
    borderRadius: 999,
    backgroundColor: "rgba(234, 96, 81, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(234, 96, 81, 0.34)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  summaryPillText: {
    color: "#ffb2a8",
    fontWeight: "800",
    fontSize: 12
  },
  summaryPillMuted: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  summaryPillMutedText: {
    color: "#dbe1ec",
    fontWeight: "700",
    fontSize: 12
  },
  summaryActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  summaryActionPillText: {
    color: "#dbe1ec",
    fontWeight: "700",
    fontSize: 12
  },
  blockerShell: {
    borderRadius: 20,
    overflow: "hidden"
  },
  inlinePanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 14
  },
  inlinePanelHeader: {
    gap: 4
  },
  inlinePanelTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "800"
  },
  inlinePanelText: {
    color: "#8b92a6",
    fontSize: 13,
    lineHeight: 19
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f8fafc"
  },
  sideRailTitleInput: {
    fontSize: 16,
    fontWeight: "700"
  },
  sideRailContextInput: {
    minHeight: 112,
    textAlignVertical: "top"
  },
  createTitleInput: {
    fontSize: 16,
    fontWeight: "700"
  },
  compactControlsRow: {
    gap: 14
  },
  fieldBlock: {
    gap: 8
  },
  fieldLabel: {
    color: "#7d8597",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choicePill: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  choicePillActive: {
    backgroundColor: "rgba(234, 96, 81, 0.18)",
    borderColor: "rgba(234, 96, 81, 0.34)"
  },
  choiceLabel: {
    color: "#dbe1ec",
    fontWeight: "700"
  },
  choiceLabelActive: {
    color: "#ffb2a8"
  },
  primaryButtonSmall: {
    borderRadius: 14,
    backgroundColor: "#7a322b",
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontWeight: "800"
  },
  quietButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  quietButtonText: {
    color: "#dbe1ec",
    fontSize: 12,
    fontWeight: "700"
  },
  buttonDisabled: {
    opacity: 0.55
  },
  commentComposerInput: {
    minHeight: 108,
    textAlignVertical: "top",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#f8fafc"
  },
  commentToolbar: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center"
  },
  uploadHint: {
    color: "#9ea6b8"
  },
  inlineError: {
    color: "#fca5a5",
    fontWeight: "700"
  },
  activityTabsRow: {
    gap: 10,
    paddingTop: 4
  },
  activityTabs: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  activityTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  activityTabActive: {
    backgroundColor: "rgba(234, 96, 81, 0.18)",
    borderColor: "rgba(234, 96, 81, 0.34)"
  },
  activityTabText: {
    color: "#b7bfd1",
    fontSize: 13,
    fontWeight: "800"
  },
  activityTabTextActive: {
    color: "#ffe1db"
  },
  activityTabCount: {
    minWidth: 22,
    textAlign: "center",
    color: "#8b92a6",
    fontSize: 12,
    fontWeight: "800"
  },
  activityTabCountActive: {
    color: "#ffc6bb"
  },
  activityCaption: {
    color: "#8b92a6",
    fontSize: 13,
    lineHeight: 19
  },
  commentStack: {
    gap: 12
  },
  commentCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  authorBadgeAi: {
    backgroundColor: "rgba(59, 130, 246, 0.26)"
  },
  authorBadgeHuman: {
    backgroundColor: "rgba(16, 185, 129, 0.22)"
  },
  authorBadgeText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "800"
  },
  commentType: {
    color: "#ffb2a8",
    fontWeight: "800",
    textTransform: "capitalize"
  },
  commentTimestamp: {
    color: "#7d8597"
  },
  commentBody: {
    color: "#e5e7eb",
    lineHeight: 22,
    fontSize: 15
  },
  attachmentCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  attachmentTitle: {
    color: "#f8fafc",
    fontWeight: "800"
  },
  attachmentMeta: {
    color: "#9ea6b8"
  },
  attachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#1f2937"
  },
  videoFrame: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#081018"
  },
  previewCard: {
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    gap: 6
  },
  previewLabel: {
    color: "#8b92a6",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  previewText: {
    color: "#e5e7eb",
    lineHeight: 20
  },
  logPayloadCard: {
    borderRadius: 14,
    backgroundColor: "rgba(7, 10, 16, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    gap: 10
  },
  logPayloadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  logPayloadText: {
    color: "#d6dcea",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace"
    })
  },
  emptyStateCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    gap: 8
  },
  emptyStateTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800"
  },
  emptyStateText: {
    color: "#9ea6b8",
    lineHeight: 22
  },
  composerDock: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#101216",
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10
  },
  composerDockRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14
  },
  composerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#315d3a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4
  },
  composerInputShell: {
    flex: 1,
    minHeight: 58,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#171a20",
    paddingLeft: 16,
    paddingRight: 10,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12
  },
  composerInput: {
    flex: 1,
    minHeight: 28,
    maxHeight: 112,
    color: "#f8fafc",
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: "center"
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 2
  },
  composerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  composerSubmitButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7a322b"
  },
  composerDockMuted: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#101216",
    paddingHorizontal: 28,
    paddingVertical: 18
  },
  composerDockMutedText: {
    color: "#8b92a6",
    fontSize: 13,
    lineHeight: 20
  },
  sideRailCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    gap: 14
  },
  sideRailCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  sideRailDirtyPill: {
    borderRadius: 999,
    backgroundColor: "rgba(234, 96, 81, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(234, 96, 81, 0.34)",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  sideRailDirtyPillText: {
    color: "#ffb2a8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  sideRailTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800"
  },
  sideRailHelpText: {
    color: "#9ea6b8",
    fontSize: 13,
    lineHeight: 20
  },
  sideRailActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  sideRailItem: {
    gap: 5,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)"
  },
  sideRailLabel: {
    color: "#7d8597",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  sideRailValue: {
    color: "#e5e7eb",
    fontSize: 15,
    lineHeight: 22
  },
  sideRailValueAccent: {
    color: "#ffb2a8"
  },
  sideRailLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start"
  },
  sideRailLinkText: {
    color: "#dbe1ec",
    fontSize: 14,
    fontWeight: "700"
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  modalCard: {
    width: "100%",
    maxWidth: 780,
    borderRadius: 24,
    backgroundColor: "#16181d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden"
  },
  modalCardSmall: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 24,
    backgroundColor: "#16181d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800"
  },
  modalSubtle: {
    color: "#8b92a6",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  modalBody: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    gap: 14
  },
  modalTitleInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "800"
  },
  modalTextInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f8fafc",
    fontSize: 16
  },
  modalChoiceRow: {
    gap: 16
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12
  },
  modalGhostButton: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  modalGhostButtonText: {
    color: "#e5e7eb",
    fontWeight: "700",
    fontSize: 15
  },
  modalPrimaryButton: {
    borderRadius: 14,
    backgroundColor: "#7a322b",
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  modalPrimaryButtonText: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 15
  },
  modalDangerButton: {
    borderRadius: 14,
    backgroundColor: "#6f1d1b",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.28)",
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  modalDangerButtonText: {
    color: "#ffe4e6",
    fontWeight: "800",
    fontSize: 15
  },
  deleteConfirmText: {
    color: "#d8deea",
    fontSize: 14,
    lineHeight: 21
  },
  deleteConfirmStrong: {
    color: "#f8fafc",
    fontWeight: "800"
  }
});
