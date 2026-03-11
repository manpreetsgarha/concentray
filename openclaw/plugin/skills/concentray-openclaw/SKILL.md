# Concentray OpenClaw Skill

Use Concentray as the system of record for queued work.

Primary tool order:
1. `task_claim_next`
2. `task_get`
3. `context_export`
4. work
5. `comment_add`
6. `task_update`

Rules:
- Use `task_claim_next` to begin work. Do not start with `task_get_next` unless you are only inspecting the queue.
- Read task context and comments before making task changes.
- Put verbose execution trace in `comment_add` with `type="log"` and structured payloads in `metadata`.
- If blocked, use `task_update` to set `status=blocked`, `assignee=human`, and provide `input_request`.
- Mark work complete with `task_update`.

There is no separate log tool. Use `comment_add` for:
- human-facing notes: `type="message"`
- decisions: `type="decision"`
- verbose logs: `type="log"`
- attachments/artifacts: `attachment` plus metadata
