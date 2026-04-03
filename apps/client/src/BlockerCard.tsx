import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { BlockerSubmission } from "./lib/blockerSubmission";
import { pickFilesForUpload } from "./lib/uploads";
import type { InputRequest } from "./types";
import { DISABLED_BUTTON_STYLE, FONT_SANS } from "./ui/theme";

interface Props {
  inputRequest: InputRequest;
  busy?: boolean;
  onError?: (message: string) => void;
  onSubmit: (payload: BlockerSubmission) => void | Promise<void>;
}

export function BlockerCard({ inputRequest, busy = false, onError, onSubmit }: Props) {
  const [textValue, setTextValue] = useState("");
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const hint = useMemo(() => {
    if (inputRequest.type === "file_or_photo") {
      return `Accept: ${inputRequest.accept.join(", ")}`;
    }
    return null;
  }, [inputRequest]);

  const fileAccept = useMemo(() => {
    if (inputRequest.type !== "file_or_photo") {
      return "";
    }
    return inputRequest.accept
      .map((value) => (value === "text/plain" ? ".txt,text/plain" : value))
      .join(",");
  }, [inputRequest]);

  const toggleChoice = (option: string) => {
    if (inputRequest.type !== "choice") {
      return;
    }
    if (!inputRequest.allow_multiple) {
      void onSubmit({ type: "choice", selections: [option] });
      return;
    }
    setSelectedChoices((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
    );
  };

  const submitMultiChoice = () => {
    if (selectedChoices.length === 0) {
      return;
    }
    void onSubmit({ type: "choice", selections: selectedChoices });
  };

  const uploadRequestedFiles = async () => {
    if (inputRequest.type !== "file_or_photo" || Platform.OS !== "web") {
      return;
    }
    try {
      const files = await pickFilesForUpload({
        accept: fileAccept,
        multiple: inputRequest.max_files > 1,
      });
      if (!mountedRef.current || files.length === 0) {
        return;
      }
      void onSubmit({ type: "file_or_photo", files });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      onError?.(error instanceof Error ? error.message : "Failed to read selected file.");
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeDot} />
        <Text style={styles.badge}>AI BLOCKED</Text>
      </View>
      <Text style={styles.prompt}>{inputRequest.prompt}</Text>

      {inputRequest.type === "choice" ? (
        <View style={styles.column}>
          <View style={styles.rowWrap}>
            {inputRequest.options.map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.choiceChip,
                  selectedChoices.includes(option) ? styles.choiceChipSelected : null,
                  busy ? DISABLED_BUTTON_STYLE : null,
                ]}
                onPress={() => toggleChoice(option)}
                disabled={busy}
              >
                <Text style={styles.choiceText}>{option}</Text>
              </Pressable>
            ))}
          </View>
          {inputRequest.allow_multiple ? (
            <Pressable
              style={[styles.submit, selectedChoices.length === 0 || busy ? DISABLED_BUTTON_STYLE : null]}
              onPress={submitMultiChoice}
              disabled={selectedChoices.length === 0 || busy}
            >
              <Text style={styles.submitText}>Submit Choices</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {inputRequest.type === "approve_reject" ? (
        <View style={styles.rowWrap}>
          <Pressable
            style={[styles.actionButton, styles.approve, busy ? DISABLED_BUTTON_STYLE : null]}
            onPress={() => onSubmit({ type: "approve_reject", approved: true })}
            disabled={busy}
          >
            <Text style={styles.actionText}>{inputRequest.approve_label}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.reject, busy ? DISABLED_BUTTON_STYLE : null]}
            onPress={() => onSubmit({ type: "approve_reject", approved: false })}
            disabled={busy}
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
            maxLength={inputRequest.max_length}
            onChangeText={setTextValue}
          />
          <Pressable
            style={[styles.submit, !textValue.trim() || busy ? DISABLED_BUTTON_STYLE : null]}
            onPress={() => onSubmit({ type: "text_input", value: textValue.trim() })}
            disabled={!textValue.trim() || busy}
          >
            <Text style={styles.submitText}>Submit</Text>
          </Pressable>
        </View>
      ) : null}

      {inputRequest.type === "file_or_photo" ? (
        <View style={styles.column}>
          <Text style={styles.hint}>{hint}</Text>
          {Platform.OS === "web" ? (
            <Pressable
              style={[styles.submit, busy ? DISABLED_BUTTON_STYLE : null]}
              onPress={() => void uploadRequestedFiles()}
              disabled={busy}
            >
              <Text style={styles.submitText}>
                {inputRequest.max_files > 1 ? "Upload Requested Files" : "Upload Requested File"}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>File responses are available on web.</Text>
          )}
          <Text style={styles.hint}>
            Max files: {inputRequest.max_files} · Max size: {inputRequest.max_size_mb} MB
          </Text>
          <Text style={styles.hint}>
            {inputRequest.capture ? "Camera capture requested when available." : "Choose an existing file."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.20)",
    backgroundColor: "rgba(244,63,94,0.06)",
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f43f5e",
  },
  badge: {
    color: "#fda4af",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: FONT_SANS,
  },
  prompt: {
    color: "#dce4f0",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  column: {
    gap: 10,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.15)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(99,130,190,0.06)",
  },
  choiceChipSelected: {
    borderColor: "rgba(0,212,170,0.32)",
    backgroundColor: "rgba(0,212,170,0.12)",
  },
  choiceText: {
    color: "#dce4f0",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: FONT_SANS,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  approve: {
    backgroundColor: "#00856b",
  },
  reject: {
    backgroundColor: "rgba(244,63,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.30)",
  },
  actionText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: FONT_SANS,
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
    fontFamily: FONT_SANS,
  },
  submit: {
    alignSelf: "flex-start",
    backgroundColor: "#00856b",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  submitText: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: FONT_SANS,
  },
  hint: {
    color: "#526080",
    fontSize: 13,
    fontFamily: FONT_SANS,
  },
});
