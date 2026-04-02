import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { FONT_SANS } from "../theme";

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable style={[styles.filterChip, active ? styles.filterChipActive : null]} onPress={onPress}>
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  filterChipActive: {
    backgroundColor: "rgba(0,212,170,0.10)",
    borderColor: "rgba(0,212,170,0.25)"
  },
  filterChipText: {
    color: "#8494b2",
    fontWeight: "600",
    fontSize: 12,
    fontFamily: FONT_SANS
  },
  filterChipTextActive: {
    color: "#5df5d0"
  }
});
