import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { formatBytes, formatTimestamp } from "../../lib/formatters";
import type { Note } from "../../types";
import { FONT_MONO, FONT_SANS } from "../theme";
import { AttachmentVideoPreview } from "./AttachmentVideoPreview";

interface AttachmentNoteCardProps {
  note: Note;
}

export function AttachmentNoteCard({ note }: AttachmentNoteCardProps) {
  const attachment = note.attachment;
  if (!attachment) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Attachment</Text>
        <Text style={styles.meta}>No attachment metadata available.</Text>
      </View>
    );
  }

  const primaryLink = attachment.preview_link ?? attachment.download_link ?? null;
  const canOpen = Boolean(primaryLink);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{attachment.filename ?? "Attachment"}</Text>
          <Text style={styles.meta}>
            {attachment.kind ?? "file"}
            {attachment.size_bytes !== undefined ? ` · ${formatBytes(attachment.size_bytes)}` : ""}
            {attachment.mime_type ? ` · ${attachment.mime_type}` : ""}
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(note.createdAt)}</Text>
      </View>

      {note.content ? <Text style={styles.caption}>{note.content}</Text> : null}

      {attachment.kind === "image" && attachment.preview_link && Platform.OS === "web" ? (
        <View style={styles.previewFrame}>
          {React.createElement("img", {
            src: attachment.preview_link,
            alt: attachment.filename ?? "Attachment preview",
            style: {
              width: "100%",
              maxHeight: 320,
              objectFit: "contain",
              borderRadius: 10,
              backgroundColor: "#060810",
            },
          })}
        </View>
      ) : null}

      {attachment.kind === "video" && attachment.preview_link ? (
        <AttachmentVideoPreview uri={attachment.preview_link} mimeType={attachment.mime_type} />
      ) : null}

      {attachment.preview_text ? <Text style={styles.previewText}>{attachment.preview_text}</Text> : null}

      <View style={styles.linkRow}>
        {attachment.preview_link ? (
          <Pressable style={styles.linkButton} onPress={() => void Linking.openURL(attachment.preview_link ?? "")}>
            <Text style={styles.linkLabel}>Open Preview</Text>
          </Pressable>
        ) : null}
        {attachment.download_link && attachment.download_link !== attachment.preview_link ? (
          <Pressable style={styles.linkButton} onPress={() => void Linking.openURL(attachment.download_link ?? "")}>
            <Text style={styles.linkLabel}>Download</Text>
          </Pressable>
        ) : null}
        {!attachment.preview_link && attachment.download_link ? (
          <Pressable style={styles.linkButton} onPress={() => void Linking.openURL(attachment.download_link ?? "")}>
            <Text style={styles.linkLabel}>Open Attachment</Text>
          </Pressable>
        ) : null}
        {!canOpen ? <Text style={styles.meta}>No openable link attached.</Text> : null}
      </View>

      {attachment.sha256 ? <Text style={styles.hash}>sha256 {attachment.sha256}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: "#f0f4fa",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  meta: {
    color: "#8494b2",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT_SANS,
  },
  timestamp: {
    color: "#526080",
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
  caption: {
    color: "#dce4f0",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  previewFrame: {
    width: "100%",
    borderRadius: 10,
    overflow: "hidden",
  },
  previewText: {
    color: "#dce4f0",
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#0b1220",
    fontFamily: FONT_MONO,
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  linkButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.20)",
    backgroundColor: "rgba(0,212,170,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkLabel: {
    color: "#7df6d8",
    fontWeight: "600",
    fontSize: 12,
    fontFamily: FONT_SANS,
  },
  hash: {
    color: "#526080",
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
});
