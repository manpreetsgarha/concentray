import React from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { FONT_MONO, FONT_SANS } from "./theme";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.shell}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>UI ERROR</Text>
          <Text style={styles.title}>The task board hit a render error.</Text>
          <Text style={styles.body}>
            This usually means the client received unexpected data or a view component threw while rendering it.
          </Text>
          <Text style={styles.detail}>{this.state.error.message}</Text>
          <Pressable style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonLabel}>Retry Render</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#050915",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.18)",
    backgroundColor: "rgba(15,22,36,0.96)",
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    color: "#fda4af",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: FONT_SANS,
  },
  title: {
    color: "#f0f4fa",
    fontSize: 24,
    fontWeight: "800",
    fontFamily: FONT_SANS,
  },
  body: {
    color: "#8494b2",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FONT_SANS,
  },
  detail: {
    color: "#dce4f0",
    fontSize: 12,
    lineHeight: 20,
    fontFamily: FONT_MONO,
  },
  button: {
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#00856b",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  buttonLabel: {
    color: "#f0f4fa",
    fontWeight: "700",
    fontFamily: FONT_SANS,
  },
});
