import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => await import("react-native-web"));

const { mockUploadTaskFile, mockPickFileForUpload } = vi.hoisted(() => ({
  mockUploadTaskFile: vi.fn(),
  mockPickFileForUpload: vi.fn(),
}));

vi.mock("../data/api", () => ({
  uploadTaskFile: mockUploadTaskFile,
}));

vi.mock("../lib/uploads", () => ({
  pickFileForUpload: mockPickFileForUpload,
}));

import { useTaskMutations, type CreateTaskPayload } from "./useTaskMutations";
import type { Task } from "../types";

interface MutationHarness {
  createTask: (payload: CreateTaskPayload) => Promise<void>;
  respondToBlocker: (payload: { type: "choice"; selections: string[] }) => Promise<void>;
  uploadAttachment: () => Promise<void>;
}

interface HarnessProps {
  onReady: (value: MutationHarness) => void;
  options: Parameters<typeof useTaskMutations>[0];
}

function HookHarness({ onReady, options }: HarnessProps) {
  const value = useTaskMutations(options);

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

function makeTask(taskId: string): Task {
  return {
    id: taskId,
    title: "Review release",
    status: "blocked",
    assignee: "human",
    targetRuntime: null,
    executionMode: "session",
    contextLink: null,
    aiUrgency: 3,
    inputRequest: null,
    inputResponse: null,
    activeRunId: null,
    checkInRequestedAt: null,
    checkInRequestedBy: null,
    createdAt: "2026-03-03T10:00:00Z",
    updatedAt: "2026-03-03T10:00:00Z",
    updatedBy: "human",
  };
}

function createPayload(overrides: Partial<CreateTaskPayload> = {}): CreateTaskPayload {
  return {
    title: "Ship it",
    assignee: "ai",
    runtime: "openclaw",
    executionMode: "autonomous",
    urgency: "3",
    contextLink: "",
    ...overrides,
  };
}

describe("useTaskMutations", () => {
  beforeEach(() => {
    mockUploadTaskFile.mockReset();
    mockPickFileForUpload.mockReset();
  });

  it("rejects invalid urgency before sending create-task requests", async () => {
    const apiRequest = vi.fn();
    const setApiError = vi.fn();
    let current: MutationHarness | null = null;
    let renderer: { unmount: () => void } | null = null;

    await act(async () => {
      renderer = create(
        <HookHarness
          onReady={(value) => {
            current = value;
          }}
          options={{
            apiRequest,
            selectedTask: null,
            noteDraft: "",
            setNoteDraft: vi.fn(),
            setSelectedTaskId: vi.fn(),
            setApiError,
            loadOverview: vi.fn(async () => {}),
            loadTaskDetail: vi.fn(async () => {}),
          }}
        />
      );
    });

    if (!current || !renderer) {
      throw new Error("Hook harness did not initialize");
    }
    const mutations = current as MutationHarness;
    const testRenderer = renderer as { unmount: () => void };

    await expect(mutations.createTask(createPayload({ urgency: "abc" }))).rejects.toThrow(
      "Urgency must be a whole number from 1 to 5."
    );
    expect(apiRequest).not.toHaveBeenCalled();
    expect(setApiError).toHaveBeenCalledWith("Urgency must be a whole number from 1 to 5.");

    testRenderer.unmount();
  });

  it("serializes blocker responses through the task respond endpoint", async () => {
    const apiRequest = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true };
      }
      return {};
    });
    const loadOverview = vi.fn(async () => {});
    const loadTaskDetail = vi.fn(async () => {});
    let current: MutationHarness | null = null;
    let renderer: { unmount: () => void } | null = null;

    await act(async () => {
      renderer = create(
        <HookHarness
          onReady={(value) => {
            current = value;
          }}
          options={{
            apiRequest,
            selectedTask: makeTask("task-1"),
            noteDraft: "",
            setNoteDraft: vi.fn(),
            setSelectedTaskId: vi.fn(),
            setApiError: vi.fn(),
            loadOverview,
            loadTaskDetail,
          }}
        />
      );
    });

    if (!current || !renderer) {
      throw new Error("Hook harness did not initialize");
    }
    const mutations = current as MutationHarness;
    const testRenderer = renderer as { unmount: () => void };

    await act(async () => {
      await mutations.respondToBlocker({ type: "choice", selections: ["ship"] });
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/tasks/task-1/respond",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          updated_by: "human",
          response: { type: "choice", selections: ["ship"] },
        }),
      })
    );
    expect(loadTaskDetail).toHaveBeenCalledWith("task-1");
    expect(loadOverview).toHaveBeenCalled();

    testRenderer.unmount();
  });

  it("cancels attachment upload when the selected task changes during file picking", async () => {
    const apiRequest = vi.fn();
    const setApiError = vi.fn();
    const loadOverview = vi.fn(async () => {});
    const loadTaskDetail = vi.fn(async () => {});
    const setNoteDraft = vi.fn();
    const setSelectedTaskId = vi.fn();
    let current: MutationHarness | null = null;
    let renderer: ReturnType<typeof create> | null = null;
    let resolveDraft: ((value: {
      filename: string;
      mime_type: string;
      size_bytes: number;
      data_base64: string;
    } | null) => void) | null = null;

    mockPickFileForUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveDraft = resolve;
      })
    );

    const renderHook = (selectedTask: Task | null) => (
      <HookHarness
        onReady={(value) => {
          current = value;
        }}
        options={{
          apiRequest,
          selectedTask,
          noteDraft: "Attach the latest brief",
          setNoteDraft,
          setSelectedTaskId,
          setApiError,
          loadOverview,
          loadTaskDetail,
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHook(makeTask("task-1")));
    });

    if (!current || !renderer || !resolveDraft) {
      throw new Error("Hook harness did not initialize");
    }
    const mutations = current as MutationHarness;
    const testRenderer = renderer as ReturnType<typeof create>;

    const uploadPromise = mutations.uploadAttachment();

    await act(async () => {
      testRenderer.update(renderHook(makeTask("task-2")));
    });

    await act(async () => {
      resolveDraft?.({
        filename: "brief.txt",
        mime_type: "text/plain",
        size_bytes: 24,
        data_base64: "YnJpZWY=",
      });
      await uploadPromise;
    });

    expect(mockUploadTaskFile).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(setNoteDraft).not.toHaveBeenCalled();
    expect(loadTaskDetail).not.toHaveBeenCalled();
    expect(setApiError).toHaveBeenCalledWith("Task changed while selecting a file. Please try again.");

    testRenderer.unmount();
  });
});
