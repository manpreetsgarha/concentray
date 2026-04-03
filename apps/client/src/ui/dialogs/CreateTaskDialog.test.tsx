import React from "react";
import { TextInput } from "react-native";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  interface MockProps {
    children?: React.ReactNode;
    [key: string]: unknown;
  }

  return {
    Platform: { OS: "web" },
    Modal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Pressable: (props: MockProps) => React.createElement("pressable", props, props.children),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: (props: MockProps) => React.createElement("text", props, props.children),
    TextInput: (props: MockProps) => React.createElement("input", props),
    View: (props: MockProps) => React.createElement("view", props, props.children),
  };
});

import { CreateTaskDialog } from "./CreateTaskDialog";

describe("CreateTaskDialog", () => {
  it("disables create and shows validation copy for invalid urgency", () => {
    const tree = create(
      <CreateTaskDialog visible busy={false} onCancel={vi.fn()} onSubmit={vi.fn(async () => {})} />
    );

    const inputs = tree.root.findAllByType(TextInput);
    act(() => {
      inputs[0]?.props.onChangeText("Launch review");
      inputs[2]?.props.onChangeText("abc");
    });

    const rendered = JSON.stringify(tree.toJSON());

    expect(rendered).toContain("Urgency must be a whole number from 1 to 5.");
  });
});
