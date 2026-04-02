import React from "react";
import { StyleSheet, View } from "react-native";

export function LogoMark() {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoMarkRingOuter} />
      <View style={styles.logoMarkRingInner} />
      <View style={styles.logoMarkCore} />
      <View style={styles.logoMarkPulse} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.22)",
    backgroundColor: "rgba(0,212,170,0.06)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  logoMarkRingOuter: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(0,212,170,0.35)"
  },
  logoMarkRingInner: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(91,141,239,0.55)"
  },
  logoMarkCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#00d4aa"
  },
  logoMarkPulse: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.08)"
  }
});
