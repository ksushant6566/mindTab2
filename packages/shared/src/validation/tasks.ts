import { z } from "zod";
import { TASK_IMPACT, TASK_PRIORITY, TASK_STATUS } from "../constants/enums";

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  impact: z.enum(TASK_IMPACT).optional(),
  position: z.number().int().optional(),
  projectId: z.string().uuid().nullable().optional(),
  completedAt: z.string().datetime().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const updateTaskPositionSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  status: z.enum(TASK_STATUS).optional(),
});

export const updateTaskPositionsSchema = z.object({
  tasks: z.array(updateTaskPositionSchema),
  sequence: z.number().int(),
});
