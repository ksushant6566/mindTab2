import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../client";

export function habitsQueryOptions() {
  return queryOptions({
    queryKey: ["habits"],
    queryFn: async () => {
      const { data, error } = await api.GET("/habits");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function habitQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["habits", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/habits/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function habitTrackerQueryOptions() {
  return queryOptions({
    queryKey: ["habit-tracker"],
    queryFn: async () => {
      const { data, error } = await api.GET("/habit-tracker");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      description?: string;
      frequency?: string;
    }) => {
      const { data, error } = await api.POST("/habits", {
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habits"] }),
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      description?: string | null;
      frequency?: string;
    }) => {
      const { data, error } = await api.PATCH("/habits/{id}", {
        params: { path: { id } },
        body: body as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habits"] }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/habits/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    async onMutate(id) {
      await qc.cancelQueries({ queryKey: ["habits"] });
      const previousHabits = qc.getQueriesData({ queryKey: ["habits"] });
      qc.setQueriesData({ queryKey: ["habits"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((habit: any) => habit.id !== id);
      });
      return { previousHabits };
    },
    onError(_err, _id, context) {
      context?.previousHabits?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

export function useTrackHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { data, error } = await api.POST("/habits/{id}/track", {
        params: { path: { id } },
        body: { date } as any,
      });
      if (error) throw error;
      return data;
    },
    async onMutate({ id, date }) {
      await qc.cancelQueries({ queryKey: ["habit-tracker"] });
      const previousTracker = qc.getQueriesData({ queryKey: ["habit-tracker"] });
      qc.setQueriesData({ queryKey: ["habit-tracker"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return [
          ...old,
          {
            habitId: id,
            date,
            status: "completed",
            id: "optimistic-" + Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: "optimistic",
          },
        ];
      });
      return { previousTracker };
    },
    onError(_err, _vars, context) {
      context?.previousTracker?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["habit-tracker"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUntrackHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await api.DELETE("/habits/{id}/track", {
        params: { path: { id } },
        body: { date } as any,
      });
      if (error) throw error;
    },
    async onMutate({ id, date }) {
      await qc.cancelQueries({ queryKey: ["habit-tracker"] });
      const previousTracker = qc.getQueriesData({ queryKey: ["habit-tracker"] });
      qc.setQueriesData({ queryKey: ["habit-tracker"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter(
          (record: any) => !(record.habitId === id && record.date === date)
        );
      });
      return { previousTracker };
    },
    onError(_err, _vars, context) {
      context?.previousTracker?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["habit-tracker"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
