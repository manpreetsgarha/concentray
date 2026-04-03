import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Platform, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useTaskDetail } from "./src/hooks/useTaskDetail";
import { useLocalApi } from "./src/hooks/useLocalApi";
import { useTaskMutations } from "./src/hooks/useTaskMutations";
import { useTaskOverview } from "./src/hooks/useTaskOverview";
import { ConfirmDialog } from "./src/ui/ConfirmDialog";
import { AppErrorBoundary } from "./src/ui/AppErrorBoundary";
import { FONT_SANS } from "./src/ui/theme";
import { CreateTaskDialog } from "./src/ui/dialogs/CreateTaskDialog";
import { CreateWorkspaceDialog } from "./src/ui/dialogs/CreateWorkspaceDialog";
import { TaskDetailPane } from "./src/ui/tasks/TaskDetailPane";
import { TaskSidebar } from "./src/ui/tasks/TaskSidebar";

function EmptyApiState() {
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

function ConnectedTaskBoard({ sharedApiUrl }: { sharedApiUrl: string }) {
  const apiRequest = useLocalApi(sharedApiUrl);
  const { width } = useWindowDimensions();
  const singleColumn = width < 1080;

  const [apiError, setApiError] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [taskToDeleteId, setTaskToDeleteId] = useState("");

  const overview = useTaskOverview({
    apiRequest,
    onError: setApiError,
  });
  const detail = useTaskDetail({
    apiRequest,
    taskId: overview.selectedTaskId,
    onError: setApiError,
  });
  const mutations = useTaskMutations({
    apiRequest,
    selectedTask: overview.selectedTask,
    noteDraft: detail.noteDraft,
    setNoteDraft: detail.setNoteDraft,
    setSelectedTaskId: overview.setSelectedTaskId,
    setApiError,
    loadOverview: overview.loadOverview,
    loadTaskDetail: detail.loadTaskDetail,
  });

  const confirmDelete = async () => {
    if (!taskToDeleteId) {
      return;
    }
    try {
      await mutations.deleteTask(taskToDeleteId);
      setTaskToDeleteId("");
    } catch {
      // Error state is surfaced by the mutation hook.
    }
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.backgroundGlowOne} />
      <View style={styles.backgroundGlowTwo} />

      <View style={[styles.shell, singleColumn ? styles.shellColumn : null]}>
        <TaskSidebar
          workspaces={overview.workspaces}
          tasks={overview.filteredTasks}
          selectedTaskId={overview.selectedTaskId}
          refreshing={overview.refreshing}
          busyAction={mutations.busyAction}
          apiError={apiError}
          taskQuery={overview.taskQuery}
          statusFilter={overview.statusFilter}
          assigneeFilter={overview.assigneeFilter}
          onRefresh={() => void overview.loadOverview()}
          onTaskQueryChange={overview.setTaskQuery}
          onStatusFilterChange={overview.setStatusFilter}
          onAssigneeFilterChange={overview.setAssigneeFilter}
          onSelectTask={overview.setSelectedTaskId}
          onToggleTaskDone={mutations.toggleTaskDone}
          onCreateTask={() => setShowCreateTask(true)}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onSwitchWorkspace={(name) => void mutations.switchWorkspace(name)}
        />

        <TaskDetailPane
          task={overview.selectedTask}
          run={detail.run}
          notes={detail.notes}
          activity={detail.activity}
          pendingCheckIn={detail.pendingCheckIn}
          detailTab={detail.detailTab}
          noteDraft={detail.noteDraft}
          busyAction={mutations.busyAction}
          onDetailTabChange={detail.setDetailTab}
          onStatusChange={(task, status) => void mutations.statusAction(task, status)}
          onRequestCheckIn={() => void mutations.requestCheckIn()}
          onNoteDraftChange={detail.setNoteDraft}
          onAddNote={() => void mutations.addNote()}
          onUploadAttachment={() => void mutations.uploadAttachment()}
          onRespond={(submission) => void mutations.respondToBlocker(submission)}
          onBlockerError={(message) => setApiError(message)}
          onDelete={() => setTaskToDeleteId(overview.selectedTask?.id ?? "")}
        />
      </View>

      <CreateTaskDialog
        visible={showCreateTask}
        busy={mutations.busyAction === "create-task"}
        onCancel={() => setShowCreateTask(false)}
        onSubmit={mutations.createTask}
      />

      <CreateWorkspaceDialog
        visible={showCreateWorkspace}
        busy={mutations.busyAction === "create-workspace"}
        onCancel={() => setShowCreateWorkspace(false)}
        onSubmit={mutations.createWorkspace}
      />

      <ConfirmDialog
        visible={Boolean(taskToDeleteId)}
        title="Delete task?"
        body="This removes the task, notes, runs, and activity from the local store."
        confirmLabel="Delete Task"
        busy={mutations.busyAction === `delete:${taskToDeleteId}`}
        onCancel={() => setTaskToDeleteId("")}
        onConfirm={() => void confirmDelete()}
      />
    </SafeAreaView>
  );
}

function TaskBoardApp() {
  const sharedApiUrl = (process.env.EXPO_PUBLIC_LOCAL_API_URL ?? "").trim();

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

  if (!sharedApiUrl) {
    return <EmptyApiState />;
  }

  return <ConnectedTaskBoard sharedApiUrl={sharedApiUrl} />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <TaskBoardApp />
    </AppErrorBoundary>
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
});
