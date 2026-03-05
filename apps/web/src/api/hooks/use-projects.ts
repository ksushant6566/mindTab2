import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../client";

export function projectsQueryOptions(params?: {
  includeArchived?: boolean;
  status?: string;
}) {
  return queryOptions({
    queryKey: ["projects", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/projects", {
        params: { query: params as any },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function projectQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["projects", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/projects/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function projectsStatsQueryOptions() {
  return queryOptions({
    queryKey: ["projects", "stats"],
    queryFn: async () => {
      const { data, error } = await api.GET("/projects/stats");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      description?: string;
      status?: string;
      startDate: string;
      endDate?: string | null;
    }) => {
      const { data, error } = await api.POST("/projects", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string | null;
      status?: string;
      startDate?: string;
      endDate?: string | null;
    }) => {
      const { data, error } = await api.PATCH("/projects/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.DELETE("/projects/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST("/projects/{id}/archive", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
