import type { components } from "@mindtab/api-spec";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "../client";

export type SaveListItem = components["schemas"]["SaveListItem"];
export type SaveDetail = components["schemas"]["SaveDetail"];

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

export function savesInfiniteQueryOptions(pageSize = 24) {
    return infiniteQueryOptions({
        queryKey: ["saves", "infinite", pageSize],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const { data, error } = await api.GET("/saves", {
                params: { query: { limit: pageSize, offset: pageParam } },
            });
            if (error) throw error;
            return {
                items: (data ?? []) as SaveListItem[],
                offset: pageParam,
            };
        },
        getNextPageParam: (lastPage) =>
            lastPage.items.length < pageSize
                ? undefined
                : lastPage.offset + pageSize,
        refetchInterval: (query) => {
            const pages = query.state.data?.pages ?? [];
            const hasProcessing = pages.some((page) =>
                page.items.some((item) =>
                    item.processing_status === "pending" || item.processing_status === "processing"
                )
            );
            return hasProcessing ? 3_000 : false;
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
            return data as SaveDetail;
        },
        refetchInterval: (query) => {
            const status = query.state.data?.processing_status;
            return status === "pending" || status === "processing" ? 3_000 : false;
        },
    });
}
