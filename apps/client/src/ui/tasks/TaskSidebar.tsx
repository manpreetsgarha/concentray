import Feather from "@expo/vector-icons/Feather";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { humanStatus } from "../../lib/formatters";
import type { Task, TaskStatus, WorkspaceSummary } from "../../types";
import { LogoMark } from "../brand/LogoMark";
import { FilterChip } from "../forms/FilterChip";
import { FONT_SANS } from "../theme";
import { TaskListItem } from "./TaskListItem";
import { WorkspaceCard } from "../workspaces/WorkspaceCard";

interface TaskSidebarProps {
  workspaces: WorkspaceSummary[];
  tasks: Task[];
  selectedTaskId: string;
  refreshing: boolean;
  busyAction: string;
  apiError: string | null;
  taskQuery: string;
  statusFilter: "all" | TaskStatus;
  assigneeFilter: "all" | "ai" | "human";
  onRefresh: () => void;
  onTaskQueryChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | TaskStatus) => void;
  onAssigneeFilterChange: (value: "all" | "ai" | "human") => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskDone: (task: Task) => void;
  onCreateTask: () => void;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (name: string) => void;
}

export function TaskSidebar({
  workspaces,
  tasks,
  selectedTaskId,
  refreshing,
  busyAction,
  apiError,
  taskQuery,
  statusFilter,
  assigneeFilter,
  onRefresh,
  onTaskQueryChange,
  onStatusFilterChange,
  onAssigneeFilterChange,
  onSelectTask,
  onToggleTaskDone,
  onCreateTask,
  onCreateWorkspace,
  onSwitchWorkspace,
}: TaskSidebarProps) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <LogoMark />
        <View style={styles.brandCopy}>
          <Text style={styles.brandTitle}>Concentray v2</Text>
          <Text style={styles.brandSubtitle}>Local AI task engine</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={onRefresh}>
          <Feather name={refreshing ? "loader" : "refresh-cw"} size={16} color="#e8eef8" />
        </Pressable>
      </View>

      {apiError ? <Text style={styles.errorText}>{apiError}</Text> : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Workspaces</Text>
        <Pressable style={styles.textButton} onPress={onCreateWorkspace}>
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
            onPress={() => onSwitchWorkspace(workspace.name)}
          />
        ))}
      </ScrollView>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Queue</Text>
        <Pressable style={styles.textButton} onPress={onCreateTask}>
          <Text style={styles.textButtonLabel}>New Task</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.searchInput}
        value={taskQuery}
        onChangeText={onTaskQueryChange}
        placeholder="Search tasks"
        placeholderTextColor="#6b7d9a"
      />

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.filterRow}>
          {(["all", "pending", "in_progress", "blocked", "done"] as const).map((option) => (
            <FilterChip
              key={option}
              label={option === "all" ? "All" : humanStatus(option)}
              active={statusFilter === option}
              onPress={() => onStatusFilterChange(option)}
            />
          ))}
        </View>
      </View>

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Assigned to</Text>
        <View style={styles.filterRow}>
          {(["all", "ai", "human"] as const).map((option) => (
            <FilterChip
              key={option}
              label={option === "all" ? "All" : option === "ai" ? "AI" : "Human"}
              active={assigneeFilter === option}
              onPress={() => onAssigneeFilterChange(option)}
            />
          ))}
        </View>
      </View>

      <ScrollView style={styles.taskList}>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              busy={busyAction.startsWith(`${task.id}:`)}
              onPress={() => onSelectTask(task.id)}
              onToggleDone={() => onToggleTaskDone(task)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptyBody}>Create a task or adjust the filters.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 360,
    minWidth: 320,
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(9,15,26,0.86)",
    padding: 20,
    gap: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandTitle: {
    color: "#f0f4fa",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  brandSubtitle: {
    color: "#526080",
    fontSize: 12,
    fontFamily: FONT_SANS,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,130,190,0.08)",
  },
  errorText: {
    color: "#fda4af",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT_SANS,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: "#dce4f0",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontFamily: FONT_SANS,
  },
  textButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  textButtonLabel: {
    color: "#7df6d8",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: FONT_SANS,
  },
  workspaceList: {
    maxHeight: 160,
  },
  searchInput: {
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
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    color: "#526080",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: FONT_SANS,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  taskList: {
    flex: 1,
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(99,130,190,0.03)",
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    color: "#dce4f0",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  emptyBody: {
    color: "#526080",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT_SANS,
  },
});
