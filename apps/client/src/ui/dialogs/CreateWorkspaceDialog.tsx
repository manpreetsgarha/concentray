import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DISABLED_BUTTON_STYLE, FONT_SANS } from "../theme";

interface CreateWorkspaceDialogProps {
  visible: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function CreateWorkspaceDialog({
  visible,
  busy,
  onCancel,
  onSubmit,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!visible) {
      setName("");
    }
  }, [visible]);

  const submit = async () => {
    try {
      await onSubmit(name);
      onCancel();
    } catch {
      // Parent surfaces the error state.
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Create workspace</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Workspace name"
            placeholderTextColor="#6b7d9a"
          />
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, !name.trim() || busy ? DISABLED_BUTTON_STYLE : null]}
              onPress={() => void submit()}
              disabled={!name.trim() || busy}
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
