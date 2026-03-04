import { z } from "zod";
import { HABIT_FREQUENCY } from "../constants/enums";

export const createHabitSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(HABIT_FREQUENCY).optional(),
});

export const updateHabitSchema = createHabitSchema.partial();

export const trackHabitSchema = z.object({
  date: z.string(),
});
