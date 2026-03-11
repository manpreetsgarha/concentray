import { z } from "zod";

export const contextEnvelopeSchema = z.object({
  schema_version: z.literal("1.0"),
  task: z.record(z.unknown()),
  context: z.record(z.unknown()),
  input_request: z.record(z.unknown()).nullable(),
  comments: z.array(z.record(z.unknown())),
  artifacts: z.array(z.record(z.unknown())),
  constraints: z.record(z.unknown()),
  timestamps: z.record(z.unknown())
});

export type ContextEnvelope = z.infer<typeof contextEnvelopeSchema>;
