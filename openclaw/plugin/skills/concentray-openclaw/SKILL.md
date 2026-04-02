# Concentray OpenClaw Skill

Use Concentray as the system of record for queued work.

Primary tool order:
1. `task_claim_next`
2. `task_get`
3. `context_export`
4. work
5. `activity_add`
6. `task_heartbeat`
7. `task_update`

Rules:
- Use `task_claim_next` to begin work. Do not start with `task_get_next` unless you are only inspecting the queue.
- Read task context, notes, and activity before making task changes.
- Put tool summaries and execution trace in `activity_add`.
- Refresh long-running claims with `task_heartbeat`.
- If blocked, use `task_update` to set `status=blocked`, `assignee=human`, and provide `input_request`.
- Mark work complete with `task_update`.
