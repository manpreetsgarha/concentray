import React from "react";
import { Text } from "react-native";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => await import("react-native-web"));

import { AttachmentNoteCard } from "./AttachmentNoteCard";

describe("AttachmentNoteCard", () => {
  it("renders a single action when only a download link is available", () => {
    const tree = create(
      <AttachmentNoteCard
        note={{
          id: "note-1",
          taskId: "task-1",
          author: "human",
          kind: "attachment",
          content: "Attached the report.",
          createdAt: "2026-03-03T10:00:00Z",
          attachment: {
            kind: "file",
            filename: "report.pdf",
            download_link: "https://example.com/report.pdf",
          },
        }}
      />
    );

    const labels = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === "string");

    expect(labels).toContain("Open Attachment");
    expect(labels).not.toContain("Download");
  });
});
