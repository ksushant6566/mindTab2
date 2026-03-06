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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
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
    async onMutate(variables) {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const previousGoals = qc.getQueriesData({ queryKey: ["goals"] });
      qc.setQueriesData({ queryKey: ["goals"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((goal: any) =>
          goal.id === variables.id ? { ...goal, ...variables } : goal
        );
      });
      return { previousGoals };
    },
    onError(_err, _vars, context) {
      context?.previousGoals?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
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
    async onMutate(id) {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const previousGoals = qc.getQueriesData({ queryKey: ["goals"] });
      qc.setQueriesData({ queryKey: ["goals"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((goal: any) => goal.id !== id);
      });
      return { previousGoals };
    },
    onError(_err, _id, context) {
      context?.previousGoals?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
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
    async onMutate(variables) {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const previousGoals = qc.getQueriesData({ queryKey: ["goals"] });
      qc.setQueriesData({ queryKey: ["goals"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        const updated = old.map((goal: any) => {
          const update = variables.goals.find((g) => g.id === goal.id);
          if (update) {
            return { ...goal, position: update.position, status: update.status ?? goal.status };
          }
          return goal;
        });
        updated.sort((a: any, b: any) => {
          const statusOrder: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, archived: 3 };
          if (a.status !== b.status) return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
          return a.position - b.position;
        });
        return updated;
      });
      return { previousGoals, sequence: variables.sequence };
    },
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
    async onMutate() {
      await qc.cancelQueries({ queryKey: ["goals"] });
      const previousGoals = qc.getQueriesData({ queryKey: ["goals"] });
      qc.setQueriesData({ queryKey: ["goals"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((goal: any) => goal.status !== "completed");
      });
      return { previousGoals };
    },
    onError(_err, _vars, context) {
      context?.previousGoals?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
