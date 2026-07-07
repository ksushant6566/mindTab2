import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";

export function savesQueryOptions(params: { limit?: number; offset?: number } = {}) {
    return queryOptions({
        queryKey: ["saves", params],
        queryFn: async () => {
            const { data, error } = await api.GET("/saves", {
                params: { query: { limit: params.limit ?? 50, offset: params.offset ?? 0 } },
            });
            if (error) throw error;
            return data ?? [];
        },
    });
}

export function saveQueryOptions(id: string) {
    return queryOptions({
        queryKey: ["saves", id],
        queryFn: async () => {
            const { data, error } = await api.GET("/saves/{id}", {
                params: { path: { id } },
            });
            if (error) throw error;
            return data;
        },
    });
}
