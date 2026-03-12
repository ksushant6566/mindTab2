import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function activityQueryOptions(api: ApiClient, userId: string) {
  return queryOptions({
    queryKey: ["activity", userId],
    queryFn: async () => {
      const { data, error } = await api.GET("/activity", {
        params: { query: { userId } },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
