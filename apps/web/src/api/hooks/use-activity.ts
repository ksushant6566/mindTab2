import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";

export function activityQueryOptions(userId: string) {
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
