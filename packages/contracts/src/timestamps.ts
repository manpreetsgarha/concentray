import { z } from "zod";

export const isoTimestampSchema = z.string().datetime({ offset: true, local: true });

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;
