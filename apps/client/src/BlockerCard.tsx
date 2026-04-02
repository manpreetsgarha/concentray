import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { InputRequest } from "./types";

interface Props {
  inputRequest: InputRequest;
  onSubmit: (payload: Record<string, unknown>) => void;
}

export function BlockerCard({ inputRequest, onSubmit }: Props) {
  const [textValue, setTextValue] = useState("");

  const hint = useMemo(() => {
    if (inputRequest.type === "file_or_photo") {
      return `Accept: ${inputRequest.accept.join(", ")}`;
    }
    return null;
  }, [inputRequest]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeDot} />
        <Text style={styles.badge}>AI BLOCKED</Text>
      </View>
      <Text style={styles.prompt}>{inputRequest.prompt}</Text>

      {inputRequest.type === "choice" ? (
        <View style={styles.rowWrap}>
          {inputRequest.options.map((option) => (
            <Pressable
              key={option}
              style={styles.choiceChip}
              onPress={() => onSubmit({ value: option })}
            >
              <Text style={styles.choiceText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {inputRequest.type === "approve_reject" ? (
        <View style={styles.rowWrap}>
          <Pressable
            style={[styles.actionButton, styles.approve]}
            onPress={() => onSubmit({ approved: true })}
          >
            <Text style={styles.actionText}>{inputRequest.approve_label}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.reject]}
            onPress={() => onSubmit({ approved: false })}
          >
            <Text style={styles.actionText}>{inputRequest.reject_label}</Text>
          </Pressable>
        </View>
      ) : null}

      {inputRequest.type === "text_input" ? (
        <View style={styles.column}>
          <TextInput
            style={styles.input}
            value={textValue}
            placeholder={inputRequest.placeholder ?? "Type response"}
            placeholderTextColor="#3d4b68"
            multiline={Boolean(inputRequest.multiline)}
            onChangeText={setTextValue}
          />
          <Pressable style={styles.submit} onPress={() => onSubmit({ value: textValue })}>
            <Text style={styles.submitText}>Submit</Text>
          </Pressable>
        </View>
      ) : null}

      {inputRequest.type === "file_or_photo" ? (
        <View style={styles.column}>
          <Text style={styles.hint}>{hint}</Text>
          <Pressable style={styles.submit} onPress={() => onSubmit({ file_link: "mock://uploaded-file" })}>
            <Text style={styles.submitText}>Upload Mock File</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const F = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif';

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.20)",
    backgroundColor: "rgba(244,63,94,0.06)",
    borderRadius: 14,
    padding: 18,
    gap: 14
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f43f5e"
  },
  badge: {
    color: "#fda4af",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: F
  },
  prompt: {
    color: "#dce4f0",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
    fontFamily: F
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.15)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(99,130,190,0.06)"
  },
  choiceText: {
    color: "#dce4f0",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: F
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  approve: {
    backgroundColor: "#00856b"
  },
  reject: {
    backgroundColor: "rgba(244,63,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.30)"
  },
  actionText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: F
  },
  column: {
    gap: 10
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.04)",
    borderRadius: 10,
    padding: 12,
    minHeight: 42,
    color: "#dce4f0",
    fontSize: 14,
    fontFamily: F
  },
  submit: {
    alignSelf: "flex-start",
    backgroundColor: "#00856b",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  submitText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: F
  },
  hint: {
    color: "#526080",
    fontSize: 13,
    fontFamily: F
  }
});
