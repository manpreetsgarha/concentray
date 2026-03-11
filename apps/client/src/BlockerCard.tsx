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
      <Text style={styles.badge}>AI BLOCKED</Text>
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

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: "rgba(219,109,52,0.28)",
    backgroundColor: "rgba(255,244,238,0.98)",
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: "#7c2d12",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 4
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#8a1538",
    color: "#fff",
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999
  },
  prompt: {
    color: "#102131",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: "rgba(16,44,87,0.12)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff"
  },
  choiceText: {
    color: "#102131",
    fontWeight: "700"
  },
  actionButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  approve: {
    backgroundColor: "#0f766e"
  },
  reject: {
    backgroundColor: "#8a1538"
  },
  actionText: {
    color: "#fff",
    fontWeight: "800"
  },
  column: {
    gap: 8
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(16, 33, 49, 0.12)",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    minHeight: 40
  },
  submit: {
    alignSelf: "flex-start",
    backgroundColor: "#102c57",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  submitText: {
    color: "#fff",
    fontWeight: "800"
  },
  hint: {
    color: "#607080"
  }
});
