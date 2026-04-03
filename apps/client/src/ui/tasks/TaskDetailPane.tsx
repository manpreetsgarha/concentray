import Feather from "@expo/vector-icons/Feather";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BlockerCard } from "../../BlockerCard";
import type { BlockerSubmission } from "../../lib/blockerSubmission";
import {
  formatMetadataJson,
  formatTimestamp,
  humanExecutionMode,
  humanRuntime,
  humanStatus,
  looksLikeUrl,
} from "../../lib/formatters";
import type { Activity, DetailTab, Note, PendingCheckIn, Run, Task, TaskStatus } from "../../types";
import { DISABLED_BUTTON_STYLE, FONT_MONO, FONT_SANS } from "../theme";
import { AttachmentNoteCard } from "./AttachmentNoteCard";

function isRunWarning(run: Run | null): boolean {
  if (!run || run.status !== "active") {
    return false;
  }
  return Date.now() - new Date(run.lastHeartbeatAt).getTime() >= 180 * 1000;
}

function statusOptions(): Array<{ label: string; value: TaskStatus }> {
  return [
    { label: "Pending", value: "pending" },
    { label: "In Progress", value: "in_progress" },
    { label: "Blocked", value: "blocked" },
    { label: "Done", value: "done" },
  ];
}

interface TaskDetailPaneProps {
  task: Task | null;
  run: Run | null;
  notes: Note[];
  activity: Activity[];
  pendingCheckIn: PendingCheckIn;
  detailTab: DetailTab;
  noteDraft: string;
  busyAction: string;
  onDetailTabChange: (tab: DetailTab) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onRequestCheckIn: () => void;
  onNoteDraftChange: (value: string) => void;
  onAddNote: () => void;
  onUploadAttachment: () => void;
  onRespond: (submission: BlockerSubmission) => void | Promise<void>;
  onBlockerError: (message: string) => void;
  onDelete: () => void;
}

export function TaskDetailPane({
  task,
  run,
  notes,
  activity,
  pendingCheckIn,
  detailTab,
  noteDraft,
  busyAction,
  onDetailTabChange,
  onStatusChange,
  onRequestCheckIn,
  onNoteDraftChange,
  onAddNote,
  onUploadAttachment,
  onRespond,
  onBlockerError,
  onDelete,
}: TaskDetailPaneProps) {
  if (!task) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No task selected</Text>
        <Text style={styles.emptyBody}>Create a task or choose one from the queue.</Text>
      </View>
    );
  }

  const responding = busyAction === `respond:${task.id}`;
  const noteBusy = busyAction === `note:${task.id}` || busyAction === `attachment:${task.id}`;
  const deleting = busyAction === `delete:${task.id}`;

  return (
    <View style={styles.detailPane}>
      <ScrollView contentContainerStyle={styles.detailScroll}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.meta}>
              {humanRuntime(task.targetRuntime)} · {humanExecutionMode(task.executionMode)} · {humanStatus(task.status)}
            </Text>
          </View>
          <Pressable
            style={[styles.deleteButton, deleting ? DISABLED_BUTTON_STYLE : null]}
            onPress={onDelete}
            disabled={deleting}
          >
            <Feather name="trash-2" size={15} color="#fecaca" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>

        {pendingCheckIn ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Awaiting check-in</Text>
            <Text style={styles.bannerBody}>
              Requested {formatTimestamp(pendingCheckIn.requested_at)} by {pendingCheckIn.requested_by}.
            </Text>
          </View>
        ) : null}

        {isRunWarning(run) ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Run heartbeat is stale</Text>
            <Text style={styles.bannerBody}>The current worker may need attention before the task expires.</Text>
          </View>
        ) : null}

        {task.status === "blocked" && task.inputRequest ? (
          <BlockerCard
            key={`${task.id}:${task.inputRequest.request_id}`}
            inputRequest={task.inputRequest}
            busy={responding}
            onError={onBlockerError}
            onSubmit={onRespond}
          />
        ) : null}

        {task.contextLink ? (
          looksLikeUrl(task.contextLink) ? (
            <Pressable style={styles.contextLinkCard} onPress={() => void Linking.openURL(task.contextLink ?? "")}>
              <Text style={styles.contextLinkLabel}>Context</Text>
              <Text style={styles.contextLinkValue}>{task.contextLink}</Text>
            </Pressable>
          ) : (
            <View style={styles.contextLinkCard}>
              <Text style={styles.contextLinkLabel}>Context</Text>
              <Text style={styles.contextLinkValue}>{task.contextLink}</Text>
            </View>
          )
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.secondaryAction, busyAction === `checkin:${task.id}` ? DISABLED_BUTTON_STYLE : null]}
            onPress={onRequestCheckIn}
            disabled={busyAction === `checkin:${task.id}`}
          >
            <Text style={styles.secondaryActionText}>Request Check-In</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          {statusOptions().map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.statusButton,
                task.status === option.value ? styles.statusButtonActive : null,
                busyAction === `${task.id}:${option.value}` ? DISABLED_BUTTON_STYLE : null,
              ]}
              onPress={() => onStatusChange(task, option.value)}
              disabled={busyAction === `${task.id}:${option.value}`}
            >
              <Text
                style={[
                  styles.statusButtonLabel,
                  task.status === option.value ? styles.statusButtonLabelActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabRow}>
          {(["notes", "activity"] as DetailTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tabButton, detailTab === tab ? styles.tabButtonActive : null]}
              onPress={() => onDetailTabChange(tab)}
            >
              <Text style={[styles.tabButtonLabel, detailTab === tab ? styles.tabButtonLabelActive : null]}>
                {tab === "notes" ? `Notes (${notes.length})` : `Activity (${activity.length})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {detailTab === "notes" ? (
          <View style={styles.stack}>
            {notes.map((note) =>
              note.kind === "attachment" ? (
                <AttachmentNoteCard key={note.id} note={note} />
              ) : (
                <View key={note.id} style={styles.feedCard}>
                  <View style={styles.feedCardHeader}>
                    <Text style={styles.feedCardTitle}>Note</Text>
                    <Text style={styles.feedTimestamp}>{formatTimestamp(note.createdAt)}</Text>
                  </View>
                  <Text style={styles.feedBody}>{note.content || "No note content."}</Text>
                </View>
              )
            )}
            <View style={styles.composerCard}>
              <TextInput
                style={styles.noteInput}
                value={noteDraft}
                onChangeText={onNoteDraftChange}
                multiline
                placeholder="Write a note or attachment caption"
                placeholderTextColor="#6b7d9a"
              />
              <View style={styles.composerActions}>
                <Pressable
                  style={[styles.primaryButton, !noteDraft.trim() || noteBusy ? DISABLED_BUTTON_STYLE : null]}
                  onPress={onAddNote}
                  disabled={!noteDraft.trim() || noteBusy}
                >
                  <Text style={styles.primaryButtonLabel}>Add Note</Text>
                </Pressable>
                {Platform.OS === "web" ? (
                  <Pressable
                    style={[styles.secondaryAction, noteBusy ? DISABLED_BUTTON_STYLE : null]}
                    onPress={onUploadAttachment}
                    disabled={noteBusy}
                  >
                    <Text style={styles.secondaryActionText}>Upload Attachment</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.stack}>
            {activity.map((entry) => (
              <View key={entry.id} style={styles.feedCard}>
                <View style={styles.feedCardHeader}>
                  <Text style={styles.feedCardTitle}>{entry.summary}</Text>
                  <Text style={styles.feedTimestamp}>{formatTimestamp(entry.createdAt)}</Text>
                </View>
                <Text style={styles.feedMeta}>
                  {entry.kind} · {entry.actor}
                  {entry.runtime ? ` · ${humanRuntime(entry.runtime)}` : ""}
                </Text>
                {entry.payload ? <Text style={styles.payloadText}>{formatMetadataJson(entry.payload)}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  detailPane: {
    flex: 1,
    minWidth: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(9,15,26,0.86)",
    overflow: "hidden",
  },
  detailScroll: {
    padding: 24,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: "#f0f4fa",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    fontFamily: FONT_SANS,
  },
  meta: {
    color: "#8494b2",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.25)",
    backgroundColor: "rgba(244,63,94,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  deleteButtonText: {
    color: "#fecaca",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.20)",
    backgroundColor: "rgba(244,63,94,0.06)",
    padding: 14,
    gap: 6,
  },
  bannerTitle: {
    color: "#fda4af",
    fontWeight: "700",
    fontSize: 13,
    fontFamily: FONT_SANS,
  },
  bannerBody: {
    color: "#dce4f0",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  contextLinkCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    padding: 14,
    gap: 6,
  },
  contextLinkLabel: {
    color: "#526080",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: FONT_SANS,
  },
  contextLinkValue: {
    color: "#dce4f0",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  secondaryAction: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: "#dce4f0",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusButtonActive: {
    backgroundColor: "rgba(0,212,170,0.10)",
    borderColor: "rgba(0,212,170,0.25)",
  },
  statusButtonLabel: {
    color: "#8494b2",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  statusButtonLabelActive: {
    color: "#7df6d8",
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  tabButtonActive: {
    backgroundColor: "rgba(0,212,170,0.10)",
    borderColor: "rgba(0,212,170,0.25)",
  },
  tabButtonLabel: {
    color: "#8494b2",
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  tabButtonLabelActive: {
    color: "#7df6d8",
  },
  stack: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.04)",
    padding: 14,
    gap: 8,
  },
  feedCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  feedCardTitle: {
    color: "#f0f4fa",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: FONT_SANS,
    flex: 1,
  },
  feedTimestamp: {
    color: "#526080",
    fontSize: 11,
    fontFamily: FONT_MONO,
  },
  feedBody: {
    color: "#dce4f0",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  feedMeta: {
    color: "#526080",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONT_SANS,
  },
  payloadText: {
    color: "#dce4f0",
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#0b1220",
    fontFamily: FONT_MONO,
  },
  composerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.03)",
    padding: 14,
    gap: 10,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.12)",
    backgroundColor: "rgba(99,130,190,0.04)",
    borderRadius: 10,
    minHeight: 88,
    padding: 12,
    color: "#dce4f0",
    fontSize: 14,
    textAlignVertical: "top",
    fontFamily: FONT_SANS,
  },
  composerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonLabel: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  emptyCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)",
    backgroundColor: "rgba(9,15,26,0.86)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  emptyTitle: {
    color: "#f0f4fa",
    fontSize: 22,
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
  emptyBody: {
    color: "#526080",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: FONT_SANS,
  },
});
