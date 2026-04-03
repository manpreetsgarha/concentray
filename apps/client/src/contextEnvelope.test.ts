import { contextEnvelopeSchema } from "@concentray/contracts";
import { describe, expect, it } from "vitest";

describe("contextEnvelopeSchema", () => {
  it("accepts the backward-compatible context export payload", () => {
    const parsed = contextEnvelopeSchema.parse({
      schema_version: "2.0",
      task: {
        id: "task-1",
        title: "Wrapper test",
        status: "blocked",
        assignee: "human",
        target_runtime: "openclaw",
        execution_mode: "session",
        ai_urgency: 4,
        context_link: null,
        input_request: {
          schema_version: "1.0",
          request_id: "req-1",
          type: "choice",
          prompt: "Approve the clean break?",
          required: true,
          created_at: "2026-03-03T10:00:00+00:00",
          options: ["approve", "reject"],
          allow_multiple: false,
        },
        input_response: null,
        active_run_id: null,
        check_in_requested_at: null,
        check_in_requested_by: null,
        created_at: "2026-03-03T10:00:00+00:00",
        updated_at: "2026-03-03T10:00:00+00:00",
        updated_by: "human",
      },
      active_run: null,
      context: {
        context_link: null,
        title: "Wrapper test",
        assignee: "human",
        target_runtime: "openclaw",
        execution_mode: "session",
      },
      input_request: {
        schema_version: "1.0",
        request_id: "req-1",
        type: "choice",
        prompt: "Approve the clean break?",
        required: true,
        created_at: "2026-03-03T10:00:00+00:00",
        options: ["approve", "reject"],
        allow_multiple: false,
      },
      input_response: null,
      notes: [],
      activity: [],
      pending_check_in: null,
      artifacts: [],
      constraints: {
        status: "blocked",
        ai_urgency: 4,
        execution_mode: "session",
        target_runtime: "openclaw",
      },
      timestamps: {
        task_updated_at: "2026-03-03T10:00:00+00:00",
        generated_at: "2026-03-03T10:05:00+00:00",
      },
    });

    expect(parsed.schema_version).toBe("2.0");
    expect(parsed.context.title).toBe("Wrapper test");
    expect(parsed.input_request?.type).toBe("choice");
    expect(parsed.constraints.status).toBe("blocked");
  });
});
