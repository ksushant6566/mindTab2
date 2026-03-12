import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function searchGoalsQueryOptions(api: ApiClient, query: string) {
  return queryOptions({
    queryKey: ["search", "goals", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await api.GET("/search/goals", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function searchHabitsQueryOptions(api: ApiClient, query: string) {
  return queryOptions({
    queryKey: ["search", "habits", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await api.GET("/search/habits", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function searchJournalsQueryOptions(api: ApiClient, query: string) {
  return queryOptions({
    queryKey: ["search", "journals", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await api.GET("/search/journals", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
