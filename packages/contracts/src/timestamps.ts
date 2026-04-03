import { z } from "zod";

export const isoTimestampSchema = z.string().datetime({ offset: true });

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;
