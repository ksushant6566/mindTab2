import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ApiClient } from "./types";

export function tasksQueryOptions(api: ApiClient, params?: {
  projectId?: string;
  includeArchived?: boolean;
}) {
  return queryOptions({
    queryKey: ["tasks", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/tasks", {
        params: { query: params },
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function taskQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/tasks/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function tasksCountQueryOptions(api: ApiClient, params?: {
  projectId?: string;
  includeArchived?: boolean;
}) {
  return queryOptions({
    queryKey: ["tasks", "count", params],
    queryFn: async () => {
      const { data, error } = await api.GET("/tasks/count", {
        params: { query: params },
      });
      if (error) throw error;
      return data?.count ?? 0;
    },
  });
}

export function unassignedTasksQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: ["tasks", "unassigned"],
    queryFn: async () => {
      const { data, error } = await api.GET("/tasks/unassigned");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTask(api: ApiClient) {
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
      const { data, error } = await api.POST("/tasks", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateTask(api: ApiClient) {
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
      const { data, error } = await api.PATCH("/tasks/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    async onMutate(variables) {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = qc.getQueriesData({ queryKey: ["tasks"] });
      qc.setQueriesData({ queryKey: ["tasks"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((task: any) =>
          task.id === variables.id ? { ...task, ...variables } : task
        );
      });
      return { previousTasks };
    },
    onError(_err, _vars, context) {
      context?.previousTasks?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteTask(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/tasks/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    async onMutate(id) {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = qc.getQueriesData({ queryKey: ["tasks"] });
      qc.setQueriesData({ queryKey: ["tasks"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((task: any) => task.id !== id);
      });
      return { previousTasks };
    },
    onError(_err, _id, context) {
      context?.previousTasks?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateTaskPositions(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      tasks: Array<{ id: string; position: number; status?: string }>;
      sequence: number;
    }) => {
      const { data, error } = await api.PATCH("/tasks/positions", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    async onMutate(variables) {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = qc.getQueriesData({ queryKey: ["tasks"] });
      qc.setQueriesData({ queryKey: ["tasks"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        const updated = old.map((task: any) => {
          const update = variables.tasks.find((g) => g.id === task.id);
          if (update) {
            return { ...task, position: update.position, status: update.status ?? task.status };
          }
          return task;
        });
        updated.sort((a: any, b: any) => {
          const statusOrder: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, archived: 3 };
          if (a.status !== b.status) return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
          return a.position - b.position;
        });
        return updated;
      });
      return { previousTasks, sequence: variables.sequence };
    },
  });
}

export function useArchiveCompletedTasks(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/tasks/archive-completed");
      if (error) throw error;
      return data;
    },
    async onMutate() {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = qc.getQueriesData({ queryKey: ["tasks"] });
      qc.setQueriesData({ queryKey: ["tasks"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((task: any) => task.status !== "completed");
      });
      return { previousTasks };
    },
    onError(_err, _vars, context) {
      context?.previousTasks?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
