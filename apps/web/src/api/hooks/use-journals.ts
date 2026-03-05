import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../client";

export function journalsQueryOptions(params?: { projectId?: string }) {
  return queryOptions({
    queryKey: ["journals", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/journals", {
        params: { query: params },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function journalQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["journals", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/journals/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function journalsCountQueryOptions() {
  return queryOptions({
    queryKey: ["journals", "count"],
    queryFn: async () => {
      const { data, error } = await api.GET("/journals/count");
      if (error) throw error;
      return data?.count ?? 0;
    },
  });
}

export function useCreateJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      content: string;
      projectId?: string | null;
    }) => {
      const { data, error } = await api.POST("/journals", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journals"] }),
  });
}

export function useUpdateJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      content?: string;
      type?: string;
      source?: string;
      projectId?: string | null;
    }) => {
      const { data, error } = await api.PATCH("/journals/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journals"] }),
  });
}

export function useDeleteJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/journals/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journals"] }),
  });
}
