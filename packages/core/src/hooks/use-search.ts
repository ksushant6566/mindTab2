import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function searchTasksQueryOptions(api: ApiClient, query: string) {
  return queryOptions({
    queryKey: ["search", "tasks", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await api.GET("/search/tasks", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function searchNotesQueryOptions(api: ApiClient, query: string) {
  return queryOptions({
    queryKey: ["search", "notes", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await api.GET("/search/notes", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
