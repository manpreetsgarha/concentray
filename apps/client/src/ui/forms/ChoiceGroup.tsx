import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FONT_SANS } from "../theme";

export interface ChoiceOption {
  label: string;
  value: string;
}

interface ChoiceGroupProps {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}

export function ChoiceGroup({ label, options, value, onChange }: ChoiceGroupProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.choicePill, option.value === value ? styles.choicePillActive : null]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.choiceLabel, option.value === value ? styles.choiceLabelActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: 8
  },
  fieldLabel: {
    color: "#3d4b68",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: FONT_SANS
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  choicePill: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99,130,190,0.10)",
    backgroundColor: "rgba(99,130,190,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  choicePillActive: {
    backgroundColor: "rgba(0,212,170,0.10)",
    borderColor: "rgba(0,212,170,0.25)"
  },
  choiceLabel: {
    color: "#8494b2",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: FONT_SANS
  },
  choiceLabelActive: {
    color: "#5df5d0"
  }
});
