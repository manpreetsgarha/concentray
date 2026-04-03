import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { DISABLED_BUTTON_STYLE, FONT_SANS } from "./theme";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, busy ? DISABLED_BUTTON_STYLE : null]} onPress={onConfirm} disabled={busy}>
              <Text style={styles.primaryLabel}>{confirmLabel}</Text>
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
    maxWidth: 420,
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.16)",
    backgroundColor: "#0f1624",
  },
  title: {
    color: "#f0f4fa",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  body: {
    color: "#8494b2",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONT_SANS,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#f43f5e",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryLabel: {
    color: "#dce4f0",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  primaryLabel: {
    color: "#fef2f2",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
});
