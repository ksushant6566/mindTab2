import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function notesQueryOptions(api: ApiClient, params?: { projectId?: string }) {
  return queryOptions({
    queryKey: ["notes", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/notes", {
        params: { query: params },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function noteQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: ["notes", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/notes/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function notesCountQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: ["notes", "count"],
    queryFn: async () => {
      const { data, error } = await api.GET("/notes/count");
      if (error) throw error;
      return data?.count ?? 0;
    },
  });
}

export function useCreateNote(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      content: string;
      type?: string;
      projectId?: string | null;
    }) => {
      const { data, error } = await api.POST("/notes", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
}

export function useUpdateNote(api: ApiClient) {
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
      const { data, error } = await api.PATCH("/notes/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
}

export function useDeleteNote(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/notes/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
}
