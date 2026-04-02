import { z } from "zod";

export const contextEnvelopeSchema = z.object({
  schema_version: z.literal("2.0"),
  task: z.record(z.unknown()),
  active_run: z.record(z.unknown()).nullable(),
  context: z.record(z.unknown()),
  input_request: z.record(z.unknown()).nullable(),
  notes: z.array(z.record(z.unknown())),
  activity: z.array(z.record(z.unknown())),
  pending_check_in: z
    .object({
      requested_at: z.string().datetime(),
      requested_by: z.string(),
    })
    .nullable(),
  artifacts: z.array(z.record(z.unknown())),
  constraints: z.record(z.unknown()),
  timestamps: z.record(z.unknown())
});

export type ContextEnvelope = z.infer<typeof contextEnvelopeSchema>;
