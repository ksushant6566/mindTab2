import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";

export function conversationsQueryOptions(params: { limit?: number; offset?: number } = {}) {
    return queryOptions({
        queryKey: ["conversations", params],
        queryFn: async () => {
            const { data, error } = await api.GET("/conversations", {
                params: { query: { limit: params.limit ?? 50, offset: params.offset ?? 0 } },
            });
            if (error) throw error;
            return data ?? { items: [], total: 0 };
        },
    });
}

export function conversationMessagesQueryOptions(id: string) {
    return queryOptions({
        queryKey: ["conversations", id, "messages"],
        queryFn: async () => {
            const { data, error } = await api.GET("/conversations/{id}/messages", {
                params: { path: { id }, query: { limit: 100, offset: 0 } },
            });
            if (error) throw error;
            return data ?? { items: [], total: 0 };
        },
    });
}
