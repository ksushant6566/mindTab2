import { View, Text, FlatList, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { habitsQueryOptions, habitTrackerQueryOptions, useTrackHabit, useUntrackHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { HabitCard } from "./habit-card";
import { WeekGrid } from "./week-grid";
import { XpAnimation } from "./xp-animation";
import { EmptyState } from "~/components/ui/empty-state";
import { Loading } from "~/components/ui/loading";
import { CheckSquare } from "lucide-react-native";

type Habit = { id: string; title: string; description?: string | null };

export function HabitList() {
  const { data: habits = [], isLoading: habitsLoading, isFetching, refetch: refetchHabits } = useQuery(habitsQueryOptions(api));
  const { data: tracker = [], refetch: refetchTracker } = useQuery(habitTrackerQueryOptions(api));
  const trackHabit = useTrackHabit(api);
  const untrackHabit = useUntrackHabit(api);
  const [xpAnim, setXpAnim] = useState<{ key: number; delta: number } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const completedToday = new Set(
    (tracker as any[])
      .filter((t: any) => t.date === today && t.status === "completed")
      .map((t: any) => t.habitId)
  );

  const handleToggle = useCallback((habitId: string) => {
    if (completedToday.has(habitId)) {
      untrackHabit.mutate({ id: habitId, date: today });
    } else {
      trackHabit.mutate({ id: habitId, date: today });
    }
  }, [completedToday, today]);

  const handleXp = useCallback((delta: number) => {
    setXpAnim({ key: Date.now(), delta });
  }, []);

  const refetch = () => {
    refetchHabits();
    refetchTracker();
  };

  if (habitsLoading) return <Loading />;

  if ((habits as Habit[]).length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="No habits yet"
        description="Create your first habit to start building streaks."
      />
    );
  }

  const typedHabits = habits as Habit[];

  return (
    <View className="flex-1">
      {xpAnim && (
        <XpAnimation
          key={xpAnim.key}
          delta={xpAnim.delta}
          onComplete={() => setXpAnim(null)}
        />
      )}
      <FlatList
        data={typedHabits}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Today
          </Text>
        }
        renderItem={({ item }) => (
          <HabitCard
            habit={item}
            isCompleted={completedToday.has(item.id)}
            onToggle={() => handleToggle(item.id)}
            onXpChange={handleXp}
          />
        )}
        ListFooterComponent={
          <WeekGrid
            habits={typedHabits}
            tracker={tracker as any[]}
            onToggleDay={(habitId, date, currentlyDone) => {
              if (currentlyDone) {
                untrackHabit.mutate({ id: habitId, date });
              } else {
                trackHabit.mutate({ id: habitId, date });
              }
            }}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fafafa" />
        }
      />
    </View>
  );
}
