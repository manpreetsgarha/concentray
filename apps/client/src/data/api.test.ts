import { describe, expect, it } from "vitest";

import { uploadTaskFile } from "./api";

describe("uploadTaskFile", () => {
  it("strips task-only fields and returns attachment metadata", async () => {
    const apiRequest = async () => ({
      ok: true,
      file: {
        task_id: "task-1",
        kind: "file",
        filename: "approval.pdf",
        mime_type: "application/pdf",
        size_bytes: 4096,
        sha256: "abc123",
        uploaded_at: "2026-03-01T10:00:00+00:00",
        preview_link: "http://127.0.0.1:8787/files/preview.pdf",
        download_link: "http://127.0.0.1:8787/files/approval.pdf",
      },
    });

    const attachment = await uploadTaskFile(apiRequest, "task-1", {
      filename: "approval.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      data_base64: "JVBERi0xLjQ=",
    });

    expect(attachment).toEqual({
      kind: "file",
      filename: "approval.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      sha256: "abc123",
      uploaded_at: "2026-03-01T10:00:00+00:00",
      preview_link: "http://127.0.0.1:8787/files/preview.pdf",
      download_link: "http://127.0.0.1:8787/files/approval.pdf",
      drive_file_id: undefined,
      preview_text: undefined,
    });
  });
});
