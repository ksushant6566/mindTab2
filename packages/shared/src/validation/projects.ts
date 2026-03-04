import { z } from "zod";
import { PROJECT_STATUS } from "../constants/enums";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();
