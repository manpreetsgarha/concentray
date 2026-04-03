import React from "react";
import { Pressable } from "react-native";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => await import("react-native-web"));

const { mockPickFilesForUpload } = vi.hoisted(() => ({
  mockPickFilesForUpload: vi.fn(),
}));

vi.mock("./lib/uploads", () => ({
  pickFilesForUpload: mockPickFilesForUpload,
}));

import { BlockerCard } from "./BlockerCard";

describe("BlockerCard", () => {
  beforeEach(() => {
    mockPickFilesForUpload.mockReset();
  });

  it("submits approve actions directly for approve_reject requests", () => {
    const onSubmit = vi.fn();
    const tree = create(
      <BlockerCard
        inputRequest={{
          schema_version: "1.0",
          request_id: "req-1",
          type: "approve_reject",
          prompt: "Approve release?",
          required: true,
          created_at: "2026-03-03T10:00:00Z",
          approve_label: "Ship",
          reject_label: "Hold",
        }}
        onSubmit={onSubmit}
      />
    );

    const buttons = tree.root.findAllByType(Pressable);
    act(() => {
      buttons[0]?.props.onPress();
    });

    expect(onSubmit).toHaveBeenCalledWith({ type: "approve_reject", approved: true });
  });

  it("ignores picked files after the card unmounts", async () => {
    const onSubmit = vi.fn();
    let resolveFiles: ((value: Array<{
      filename: string;
      mime_type: string;
      size_bytes: number;
      data_base64: string;
    }>) => void) | null = null;

    mockPickFilesForUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveFiles = resolve;
      })
    );

    const tree = create(
      <BlockerCard
        inputRequest={{
          schema_version: "1.0",
          request_id: "req-file",
          type: "file_or_photo",
          prompt: "Upload the requested file.",
          required: true,
          created_at: "2026-03-03T10:00:00Z",
          accept: ["text/plain"],
          max_files: 1,
          max_size_mb: 10,
          capture: false,
        }}
        onSubmit={onSubmit}
      />
    );

    const buttons = tree.root.findAllByType(Pressable);
    act(() => {
      buttons[0]?.props.onPress();
    });

    await act(async () => {
      tree.unmount();
      resolveFiles?.([
        {
          filename: "brief.txt",
          mime_type: "text/plain",
          size_bytes: 24,
          data_base64: "YnJpZWY=",
        },
      ]);
      await Promise.resolve();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
