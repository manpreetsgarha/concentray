import { describe, expect, it, vi } from "vitest";

import { pickFilesFromDocument } from "./uploadPicker";

interface MockInput {
  type: string;
  accept: string;
  multiple: boolean;
  files: File[];
  onchange: (() => void) | null;
  oncancel: (() => void) | null;
  click: () => void;
}

function createInput(files: File[] = []): MockInput {
  const input: MockInput = {
    type: "",
    accept: "",
    multiple: false,
    files,
    onchange: null,
    oncancel: null,
    click: () => {
      input.onchange?.();
    },
  };
  return input;
}

function createFile(name: string): File {
  return { name } as File;
}

function createDraft(filename: string) {
  return {
    filename,
    mime_type: "text/plain",
    size_bytes: 12,
    data_base64: "Z29vZA==",
  };
}

describe("pickFilesFromDocument", () => {
  it("treats an empty selection as cancel", async () => {
    const input = createInput();
    const doc = {
      createElement: vi.fn(() => input),
    };

    await expect(pickFilesFromDocument(doc)).resolves.toEqual([]);
  });

  it("rejects when a selected file cannot be read", async () => {
    const input = createInput([createFile("bad.txt")]);
    const doc = {
      createElement: vi.fn(() => input),
    };

    await expect(
      pickFilesFromDocument(doc, undefined, async () => {
        throw new Error("Failed to read bad.txt");
      })
    ).rejects.toThrow("Failed to read bad.txt");
  });

  it("returns upload drafts when reads succeed", async () => {
    const input = createInput([createFile("good.txt")]);
    const doc = {
      createElement: vi.fn(() => input),
    };
    const expected = createDraft("good.txt");

    await expect(
      pickFilesFromDocument(doc, undefined, async () => expected)
    ).resolves.toEqual([expected]);
  });
});
