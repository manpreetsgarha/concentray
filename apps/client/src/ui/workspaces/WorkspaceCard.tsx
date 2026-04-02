import Feather from "@expo/vector-icons/Feather";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { workspaceAccent } from "../../lib/formatters";
import type { WorkspaceSummary } from "../../types";
import { FONT_SANS } from "../theme";

interface WorkspaceCardProps {
  workspace: WorkspaceSummary;
  isSelected: boolean;
  collapsed?: boolean;
  canDelete?: boolean;
  busy?: boolean;
  onPress: () => void;
  onDelete?: () => void;
}

export function WorkspaceCard(props: WorkspaceCardProps) {
  const { workspace, isSelected, collapsed = false, canDelete = false, busy = false, onPress, onDelete } = props;
  const summary = isSelected ? "Current lane" : workspace.store ? "Local workspace" : "Workspace";
  const accent = workspaceAccent(workspace.name);

  return (
    <View
      style={[
        styles.workspaceCard,
        isSelected ? styles.workspaceCardActive : null,
        collapsed ? styles.workspaceCardCollapsed : null
      ]}
    >
      <Pressable style={styles.workspaceCardPressable} onPress={onPress}>
        <View
          style={[
            styles.workspaceGlyph,
            isSelected ? styles.workspaceGlyphActive : null,
            { borderColor: `${accent}55` }
          ]}
        >
          <View style={[styles.workspaceGlyphDot, { backgroundColor: accent }]} />
        </View>
        {!collapsed ? (
          <View style={styles.workspaceCardBody}>
            <View style={styles.workspaceCardTop}>
              <Text style={styles.workspaceName}>{workspace.name}</Text>
              <View style={[styles.workspaceStatePill, workspace.active ? styles.workspaceStatePillActive : null]}>
                <Text style={styles.workspaceStateText}>{workspace.active ? "Live" : "Idle"}</Text>
              </View>
            </View>
            <Text style={styles.workspaceStore} numberOfLines={1}>
              {summary}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {!collapsed && canDelete && onDelete ? (
        <Pressable
          style={[styles.workspaceDeleteButton, busy ? styles.buttonDisabled : null]}
          onPress={onDelete}
          disabled={busy}
        >
          <Feather name="trash-2" size={13} color="#526080" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  workspaceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent"
  },
  workspaceCardPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  workspaceCardActive: {
    backgroundColor: "rgba(0,212,170,0.06)",
    borderColor: "rgba(0,212,170,0.14)"
  },
  workspaceCardCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 8
  },
  workspaceGlyph: {
    minWidth: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(99,130,190,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  workspaceGlyphActive: {
    backgroundColor: "rgba(0,212,170,0.10)"
  },
  workspaceGlyphDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  workspaceCardBody: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  workspaceCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  workspaceName: {
    color: "#dce4f0",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: FONT_SANS
  },
  workspaceStatePill: {
    borderRadius: 999,
    backgroundColor: "rgba(99,130,190,0.08)",
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  workspaceStatePillActive: {
    backgroundColor: "rgba(0,212,170,0.14)"
  },
  workspaceStateText: {
    color: "#8494b2",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: FONT_SANS
  },
  workspaceStore: {
    color: "#3d4b68",
    fontSize: 11,
    fontFamily: FONT_SANS
  },
  workspaceDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,130,190,0.05)",
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.08)"
  },
  buttonDisabled: {
    opacity: 0.45
  }
});
