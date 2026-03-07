import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Repeat,
} from "lucide-react-native";
import {
  habitsQueryOptions,
  habitTrackerQueryOptions,
  useTrackHabit,
  useUntrackHabit,
  useDeleteHabit,
} from "@mindtab/core";

import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { XPFloat } from "~/components/ui/xp-float";
import { StreakFlame } from "~/components/ui/streak-flame";
import { EmptyState } from "~/components/ui/empty-state";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

// ---------- Helpers ----------

function getWeekDays(weekOffset: number): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().split("T")[0]!);
  }
  return days;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getStreakCount(
  habitId: string,
  completionMap: Map<string, Set<string>>,
): number {
  const dates = completionMap.get(habitId);
  if (!dates || dates.size === 0) return 0;

  let streak = 0;
  const today = new Date();
  const d = new Date(today);

  // Check today first; if not done today, start from yesterday
  const todayStr = d.toISOString().split("T")[0]!;
  if (!dates.has(todayStr)) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const dateStr = d.toISOString().split("T")[0]!;
    if (dates.has(dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function getBestStreak(
  habitId: string,
  completionMap: Map<string, Set<string>>,
): number {
  const dates = completionMap.get(habitId);
  if (!dates || dates.size === 0) return 0;

  const sortedDates = [...dates].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]!);
    const curr = new Date(sortedDates[i]!);
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      current++;
      best = Math.max(best, current);
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return best;
}

// ---------- Screen ----------

export default function HabitsScreen() {
  const router = useRouter();

  const {
    data: habits,
    isLoading,
    refetch: refetchHabits,
  } = useQuery(habitsQueryOptions(api));
  const { data: tracker, refetch: refetchTracker } = useQuery(
    habitTrackerQueryOptions(api),
  );

  const trackHabit = useTrackHabit(api);
  const untrackHabit = useUntrackHabit(api);
  const deleteHabit = useDeleteHabit(api);

  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0]!, []);

  // Build completion map: habitId -> Set<date>
  const completionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!tracker) return map;
    for (const entry of tracker) {
      const habitId = (entry as any).habitId as string;
      const date = (entry as any).date as string;
      const status = (entry as any).status as string;
      if (status === "completed") {
        if (!map.has(habitId)) map.set(habitId, new Set());
        map.get(habitId)!.add(date);
      }
    }
    return map;
  }, [tracker]);

  // Today's completed set
  const todayCompletedSet = useMemo(() => {
    const set = new Set<string>();
    if (!tracker) return set;
    for (const entry of tracker) {
      if (
        (entry as any).date === todayStr &&
        (entry as any).status === "completed"
      ) {
        set.add((entry as any).habitId);
      }
    }
    return set;
  }, [tracker, todayStr]);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchHabits(), refetchTracker()]);
    setRefreshing(false);
  }, [refetchHabits, refetchTracker]);

  const totalCount = habits?.length ?? 0;
  const completedCount = useMemo(() => {
    if (!habits) return 0;
    return habits.filter((h: any) => todayCompletedSet.has(h.id)).length;
  }, [habits, todayCompletedSet]);

  // ---------- Layout ----------

  if (!habits || habits.length === 0) {
    if (isLoading) return null;
    return (
      <View style={styles.screen}>
        <EmptyState
          icon={Repeat}
          title="No habits yet"
          description="Build consistency by creating your first habit"
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent.indigo}
        />
      }
    >
      {/* ========== TODAY SECTION ========== */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>TODAY'S HABITS</Text>
          <Text
            style={[
              styles.counter,
              completedCount > 0 && { color: colors.accent.indigo },
            ]}
          >
            {completedCount}/{totalCount}
          </Text>
        </View>

        {habits.map((habit: any) => {
          const isCompleted = todayCompletedSet.has(habit.id);
          return (
            <TodayHabitRow
              key={habit.id}
              habit={habit}
              isCompleted={isCompleted}
              todayStr={todayStr}
              onTrack={() =>
                trackHabit.mutate({ id: habit.id, date: todayStr })
              }
              onUntrack={() =>
                untrackHabit.mutate({ id: habit.id, date: todayStr })
              }
              onEdit={() =>
                router.push(`/(main)/habits/${habit.id}`)
              }
              onDelete={() => deleteHabit.mutate(habit.id)}
            />
          );
        })}
      </View>

      {/* ========== WEEK GRID ========== */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>WEEK VIEW</Text>
          <View style={styles.weekNav}>
            <Pressable
              onPress={() => setWeekOffset((w) => w - 1)}
              style={styles.weekNavButton}
            >
              <ChevronLeft size={18} color={colors.text.secondary} />
            </Pressable>
            {weekOffset !== 0 ? (
              <Pressable onPress={() => setWeekOffset(0)}>
                <Text style={styles.weekNavLabel}>This week</Text>
              </Pressable>
            ) : (
              <Text style={styles.weekNavLabel}>This week</Text>
            )}
            <Pressable
              onPress={() => setWeekOffset((w) => w + 1)}
              style={styles.weekNavButton}
            >
              <ChevronRight size={18} color={colors.text.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Grid header (day labels) */}
        <View style={styles.gridRow}>
          <View style={styles.gridLabelCell} />
          {DAY_LABELS.map((label, i) => {
            const isToday = weekDays[i] === todayStr;
            return (
              <View key={i} style={styles.gridHeaderCell}>
                <Text
                  style={[
                    styles.gridDayLabel,
                    isToday && { color: colors.accent.indigo },
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Grid rows (one per habit) */}
        {habits.map((habit: any) => {
          const dates = completionMap.get(habit.id);
          return (
            <View key={habit.id} style={styles.gridRow}>
              <View style={styles.gridLabelCell}>
                <Text style={styles.gridHabitName} numberOfLines={1}>
                  {habit.title}
                </Text>
              </View>
              {weekDays.map((day, i) => {
                const isDone = dates?.has(day) ?? false;
                const isToday = day === todayStr;
                const isFuture = day > todayStr;

                return (
                  <View key={i} style={styles.gridCell}>
                    <View
                      style={[
                        styles.gridDot,
                        isDone && styles.gridDotCompleted,
                        !isDone &&
                          !isFuture &&
                          !isToday &&
                          styles.gridDotMissed,
                        (isToday || isFuture) &&
                          !isDone &&
                          styles.gridDotHollow,
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* ========== STREAK CARDS ========== */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>STREAKS</Text>

        <View style={styles.streakGrid}>
          {habits.map((habit: any) => {
            const currentStreak = getStreakCount(habit.id, completionMap);
            const bestStreak = getBestStreak(habit.id, completionMap);

            return (
              <PressableCard
                key={habit.id}
                onPress={() => router.push(`/(main)/habits/${habit.id}`)}
                style={styles.streakCard}
              >
                <Text style={styles.streakHabitName} numberOfLines={1}>
                  {habit.title}
                </Text>
                <View style={styles.streakRow}>
                  <StreakFlame count={currentStreak} size={18} />
                </View>
                <Text style={styles.streakBestLabel}>
                  Best: {bestStreak} day{bestStreak !== 1 ? "s" : ""}
                </Text>
              </PressableCard>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- Today Habit Row ----------

type TodayHabitRowProps = {
  habit: { id: string; title: string };
  isCompleted: boolean;
  todayStr: string;
  onTrack: () => void;
  onUntrack: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function TodayHabitRow({
  habit,
  isCompleted,
  todayStr,
  onTrack,
  onUntrack,
  onEdit,
  onDelete,
}: TodayHabitRowProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [xpDelta, setXpDelta] = useState<number | null>(null);

  const handleToggle = useCallback(async () => {
    if (isCompleted) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setXpDelta(-10);
      onUntrack();
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowConfetti(true);
      setXpDelta(10);
      onTrack();
    }
  }, [isCompleted, onTrack, onUntrack]);

  return (
    <SwipeableRow
      rightActions={[
        {
          label: "Edit",
          color: colors.status.active,
          onAction: onEdit,
        },
        {
          label: "Delete",
          color: colors.feedback.error,
          onAction: onDelete,
        },
      ]}
    >
      <View style={[styles.habitRow, isCompleted && styles.habitRowCompleted]}>
        <Pressable onPress={handleToggle} style={styles.checkboxArea}>
          {isCompleted ? (
            <CheckCircle2 size={22} color={colors.status.completed} />
          ) : (
            <Circle size={22} color={colors.text.muted} />
          )}
          {showConfetti && (
            <ConfettiBurst onComplete={() => setShowConfetti(false)} />
          )}
          {xpDelta !== null && (
            <XPFloat amount={xpDelta} onComplete={() => setXpDelta(null)} />
          )}
        </Pressable>

        <Text
          style={[
            styles.habitTitle,
            isCompleted && styles.habitTitleCompleted,
          ]}
          numberOfLines={1}
        >
          {habit.title}
        </Text>
      </View>
    </SwipeableRow>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },

  // Sections
  sectionContainer: {
    marginBottom: 28,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.text.muted,
  },
  counter: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: colors.text.muted,
  },

  // Habit row (today)
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
  },
  habitRowCompleted: {
    backgroundColor: colors.feedback.successMuted,
  },
  checkboxArea: {
    position: "relative",
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  habitTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  habitTitleCompleted: {
    color: colors.status.completed,
    textDecorationLine: "line-through",
  },

  // Week navigation
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weekNavButton: {
    padding: 4,
  },
  weekNavLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "500",
  },

  // Week grid
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  gridLabelCell: {
    width: 100,
  },
  gridHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  gridCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  gridDayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
  },
  gridHabitName: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  gridDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border.default,
  },
  gridDotCompleted: {
    backgroundColor: colors.status.completed,
  },
  gridDotMissed: {
    backgroundColor: colors.text.muted,
    opacity: 0.4,
  },
  gridDotHollow: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },

  // Streak cards
  streakGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  streakCard: {
    width: "48%",
    flexGrow: 0,
    flexShrink: 0,
    padding: 12,
  },
  streakHabitName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: 8,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  streakBestLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
});
