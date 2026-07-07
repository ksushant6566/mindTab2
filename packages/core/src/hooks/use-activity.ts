import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./types";

type ActivityDay = {
  date: string;
  count: number;
  details?: {
    tasksCreated?: number;
    tasksCompleted?: number;
    notesCreated?: number;
    notesUpdated?: number;
  };
};

function normalizeActivity(data: unknown): ActivityDay[] {
  if (Array.isArray(data)) {
    return data as ActivityDay[];
  }

  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, Omit<ActivityDay, "date">>)
      .map(([date, activity]) => ({ date, ...activity }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return [];
}

export function activityQueryOptions(api: ApiClient, userId: string) {
  return queryOptions({
    queryKey: ["activity", userId],
    queryFn: async () => {
      const { data, error } = await api.GET("/activity", {
        params: { query: { userId } },
      });
      if (error) throw error;
      return normalizeActivity(data);
    },
  });
}
