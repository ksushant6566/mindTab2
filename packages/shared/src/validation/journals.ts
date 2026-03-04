import { z } from "zod";

export const createJournalSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  projectId: z.string().uuid().nullable().optional(),
});

export const updateJournalSchema = createJournalSchema.partial();
