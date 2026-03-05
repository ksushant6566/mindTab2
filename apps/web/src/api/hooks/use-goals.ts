import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../client";

export function goalsQueryOptions(params?: {
  projectId?: string;
  includeArchived?: boolean;
}) {
  return queryOptions({
    queryKey: ["goals", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals", {
        params: { query: params },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function goalQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["goals", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function goalsCountQueryOptions(params?: {
  projectId?: string;
  includeArchived?: boolean;
}) {
  return queryOptions({
    queryKey: ["goals", "count", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals/count", {
        params: { query: params },
      });
      if (error) throw error;
      return data?.count ?? 0;
    },
  });
}

export function unassignedGoalsQueryOptions() {
  return queryOptions({
    queryKey: ["goals", "unassigned"],
    queryFn: async () => {
      const { data, error } = await api.GET("/goals/unassigned");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      impact?: string;
      position?: number;
      projectId?: string | null;
      completedAt?: string;
    }) => {
      const { data, error } = await api.POST("/goals", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      impact?: string;
      position?: number;
      projectId?: string | null;
      completedAt?: string | null;
    }) => {
      const { data, error } = await api.PATCH("/goals/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/goals/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useUpdateGoalPositions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      goals: Array<{ id: string; position: number; status?: string }>;
      sequence: number;
    }) => {
      const { data, error } = await api.PATCH("/goals/positions", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useArchiveCompletedGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/goals/archive-completed");
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}
