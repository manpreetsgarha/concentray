import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { CreateTaskPayload } from "../../hooks/useTaskMutations";
import { taskUrgencyError } from "../../lib/taskDrafts";
import type { TaskExecutionMode } from "../../types";
import { ChoiceGroup } from "../forms/ChoiceGroup";
import { DISABLED_BUTTON_STYLE, FONT_SANS } from "../theme";

interface CreateTaskDialogProps {
  visible: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateTaskPayload) => Promise<void>;
}

function runtimeOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "Any", value: "any" },
    { label: "OpenClaw", value: "openclaw" },
    { label: "Claude", value: "claude" },
    { label: "Codex", value: "codex" },
  ];
}

export function CreateTaskDialog({
  visible,
  busy,
  onCancel,
  onSubmit,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [runtime, setRuntime] = useState("openclaw");
  const [assignee, setAssignee] = useState<"ai" | "human">("ai");
  const [executionMode, setExecutionMode] = useState<TaskExecutionMode>("autonomous");
  const [urgency, setUrgency] = useState("3");
  const [contextLink, setContextLink] = useState("");
  const urgencyError = taskUrgencyError(urgency);
  const canSubmit = title.trim().length > 0 && !busy && urgencyError === null;

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setRuntime("openclaw");
      setAssignee("ai");
      setExecutionMode("autonomous");
      setUrgency("3");
      setContextLink("");
    }
  }, [visible]);

  const submit = async () => {
    try {
      await onSubmit({
        title,
        runtime,
        assignee,
        executionMode,
        urgency,
        contextLink,
      });
      onCancel();
    } catch {
      // Parent surfaces the error state.
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Create task</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor="#6b7d9a"
          />
          <TextInput
            style={styles.input}
            value={contextLink}
            onChangeText={setContextLink}
            placeholder="Context link"
            placeholderTextColor="#6b7d9a"
          />
          <TextInput
            style={styles.input}
            value={urgency}
            onChangeText={setUrgency}
            placeholder="Urgency 1-5"
            placeholderTextColor="#6b7d9a"
            keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
          />
          {urgencyError ? <Text style={styles.validationText}>{urgencyError}</Text> : null}
          <ChoiceGroup
            label="Assigned To"
            value={assignee}
            onChange={(value) => setAssignee(value as "ai" | "human")}
            options={[
              { label: "AI", value: "ai" },
              { label: "Human", value: "human" },
            ]}
          />
          <ChoiceGroup label="Runs On" value={runtime} onChange={setRuntime} options={runtimeOptions()} />
          <ChoiceGroup
            label="Execution"
            value={executionMode}
            onChange={(value) => setExecutionMode(value as TaskExecutionMode)}
            options={[
              { label: "Autonomous", value: "autonomous" },
              { label: "Session", value: "session" },
            ]}
          />
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, !canSubmit ? DISABLED_BUTTON_STYLE : null]}
              onPress={() => void submit()}
              disabled={!canSubmit}
            >
              <Text style={styles.primaryLabel}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,8,16,0.72)",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "#0f1624",
    padding: 20,
    gap: 14,
  },
  title: {
    color: "#f0f4fa",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  input: {
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
  validationText: {
    color: "#fda4af",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT_SANS,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryLabel: {
    color: "#dce4f0",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryLabel: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
});
