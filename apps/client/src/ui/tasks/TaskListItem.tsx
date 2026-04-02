import Feather from "@expo/vector-icons/Feather";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatTimestamp } from "../../lib/formatters";
import type { Task } from "../../types";
import { FONT_MONO, FONT_SANS } from "../theme";

interface TaskListItemProps {
  task: Task;
  selected: boolean;
  busy?: boolean;
  onPress: () => void;
  onToggleDone: () => void;
}

function statusBarStyle(status: Task["status"]) {
  if (status === "Blocked") {
    return styles.statusBarBlocked;
  }
  if (status === "In Progress") {
    return styles.statusBarInProgress;
  }
  if (status === "Done") {
    return styles.statusBarDone;
  }
  return styles.statusBarPending;
}

export function TaskListItem({ task, selected, busy = false, onPress, onToggleDone }: TaskListItemProps) {
  const strike = task.status === "Done";

  return (
    <View style={[styles.taskCard, selected ? styles.taskCardSelected : null]}>
      <View style={[styles.taskStatusBar, statusBarStyle(task.status)]} />
      <Pressable
        style={[styles.taskCheckButton, strike ? styles.taskCheckButtonDone : null, busy ? styles.buttonDisabled : null]}
        onPress={onToggleDone}
        disabled={busy}
      >
        <Feather name={strike ? "check-circle" : "circle"} size={16} color={strike ? "#526080" : "#8494b2"} />
      </Pressable>
      <Pressable style={styles.taskCardBody} onPress={onPress}>
        <View style={styles.taskCardHeader}>
          <Text style={[styles.taskCardTitle, strike ? styles.taskCardTitleDone : null]} numberOfLines={2}>
            {task.title}
          </Text>
          {task.inputRequest ? <Text style={styles.taskBlockedHint}>Blocked</Text> : null}
        </View>
        <View style={styles.taskMetaRow}>
          <Text style={styles.taskCardMeta}>
            {task.assignee} · {task.executionMode} · {task.status}
          </Text>
          <Text style={styles.taskTimestamp}>{formatTimestamp(task.updatedAt)}</Text>
        </View>
        <Text style={styles.taskUrgency}>Urgency {task.aiUrgency ?? 3}/5</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  taskCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent"
  },
  taskStatusBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: "rgba(99,130,190,0.12)",
    marginVertical: 2
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
  taskCheckButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  taskCheckButtonDone: {
    backgroundColor: "rgba(99,130,190,0.06)"
  },
  taskCardSelected: {
    borderColor: "rgba(0,212,170,0.18)",
    backgroundColor: "rgba(0,212,170,0.04)"
  },
  taskCardBody: {
    flex: 1,
    gap: 5,
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
    color: "#dce4f0",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    fontFamily: FONT_SANS
  },
  taskCardTitleDone: {
    color: "#3d4b68",
    textDecorationLine: "line-through"
  },
  taskBlockedHint: {
    color: "#f43f5e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(244,63,94,0.10)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: FONT_SANS
  },
  taskMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap"
  },
  taskCardMeta: {
    color: "#526080",
    fontSize: 12,
    fontFamily: FONT_SANS
  },
  taskTimestamp: {
    color: "#3d4b68",
    fontSize: 11,
    fontFamily: FONT_MONO
  },
  taskUrgency: {
    color: "#526080",
    fontSize: 12,
    fontFamily: FONT_SANS
  },
  buttonDisabled: {
    opacity: 0.45
  }
});
