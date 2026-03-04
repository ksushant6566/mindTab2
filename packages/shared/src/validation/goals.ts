import { z } from "zod";
import { GOAL_IMPACT, GOAL_PRIORITY, GOAL_STATUS } from "../constants/enums";

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(GOAL_STATUS).optional(),
  priority: z.enum(GOAL_PRIORITY).optional(),
  impact: z.enum(GOAL_IMPACT).optional(),
  position: z.number().int().optional(),
  projectId: z.string().uuid().nullable().optional(),
  completedAt: z.string().datetime().optional(),
});

export const updateGoalSchema = createGoalSchema.partial();

export const updateGoalPositionSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  status: z.enum(GOAL_STATUS).optional(),
});

export const updateGoalPositionsSchema = z.object({
  goals: z.array(updateGoalPositionSchema),
  sequence: z.number().int(),
});
