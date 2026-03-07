import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react-native";
import {
  habitsQueryOptions,
  habitTrackerQueryOptions,
  useTrackHabit,
  useUntrackHabit,
} from "@mindtab/core";

import { SwipeableRow } from "~/components/ui/swipeable-row";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { XPFloat } from "~/components/ui/xp-float";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

type HabitsSectionProps = {
  projectId: string | null;
};

export function HabitsSection({ projectId: _projectId }: HabitsSectionProps) {
  const router = useRouter();
  const { data: habits } = useQuery(habitsQueryOptions(api));
  const { data: tracker } = useQuery(habitTrackerQueryOptions(api));

  const trackHabit = useTrackHabit(api);
  const untrackHabit = useUntrackHabit(api);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0]!, []);

  const completedSet = useMemo(() => {
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

  const totalCount = habits?.length ?? 0;
  const completedCount = useMemo(() => {
    if (!habits) return 0;
    return habits.filter((h: any) => completedSet.has(h.id)).length;
  }, [habits, completedSet]);

  // Item 17: Counter spring bump 1.0→1.3→1.0
  const counterScale = useSharedValue(1);
  const prevCompletedCount = useRef(completedCount);
  useEffect(() => {
    if (completedCount !== prevCompletedCount.current) {
      counterScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 400 }),
        withSpring(1.0, { damping: 12, stiffness: 300 }),
      );
      prevCompletedCount.current = completedCount;
    }
  }, [completedCount]);
  const counterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: counterScale.value }],
  }));

  // Build a map of the last 5 days' completion status per habit
  const last5Days = useMemo(() => {
    const days: string[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]!);
    }
    return days;
  }, []);

  const completionByHabitAndDate = useMemo(() => {
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

  if (!habits || habits.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TODAY'S HABITS</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No habits yet</Text>
          <Pressable onPress={() => router.push("/(modals)/create-habit")}>
            <Text style={styles.emptyLink}>Create your first habit</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>TODAY'S HABITS</Text>
        <Animated.Text
          style={[
            styles.counter,
            completedCount > 0 && { color: colors.accent.indigo },
            counterAnimStyle,
          ]}
        >
          {completedCount}/{totalCount}
        </Animated.Text>
      </View>

      {/* Habit rows */}
      {habits.map((habit: any) => {
        const isCompleted = completedSet.has(habit.id);
        const dates = completionByHabitAndDate.get(habit.id);

        return (
          <HabitRow
            key={habit.id}
            habit={habit}
            isCompleted={isCompleted}
            todayStr={todayStr}
            last5Days={last5Days}
            completedDates={dates}
            onTrack={() =>
              trackHabit.mutate({ id: habit.id, date: todayStr })
            }
            onUntrack={() =>
              untrackHabit.mutate({ id: habit.id, date: todayStr })
            }
          />
        );
      })}

      {/* Show all habits link */}
      <Pressable
        style={styles.showAllRow}
        onPress={() => router.push("/(main)/habits")}
      >
        <Text style={styles.showAllText}>Show all habits</Text>
        <ChevronRight size={16} color={colors.accent.indigo} />
      </Pressable>
    </View>
  );
}

// ---------- Individual Habit Row ----------

type HabitRowProps = {
  habit: { id: string; title: string };
  isCompleted: boolean;
  todayStr: string;
  last5Days: string[];
  completedDates: Set<string> | undefined;
  onTrack: () => void;
  onUntrack: () => void;
};

function HabitRow({
  habit,
  isCompleted,
  todayStr,
  last5Days,
  completedDates,
  onTrack,
  onUntrack,
}: HabitRowProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [xpDelta, setXpDelta] = useState<number | null>(null);

  // Item 15: Checkbox scale animation 1.0→0.8→1.2→1.0
  const checkboxScale = useSharedValue(1);
  const checkboxAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkboxScale.value }],
  }));

  // Item 16: Row flash green on complete
  const rowFlash = useSharedValue(0);
  const rowFlashStyle = useAnimatedStyle(() => ({
    backgroundColor:
      rowFlash.value > 0
        ? `rgba(34, 197, 94, ${rowFlash.value * 0.15})`
        : "transparent",
  }));

  const handleToggle = useCallback(async () => {
    // Item 15: scale morph 1.0→0.8→1.2→1.0
    checkboxScale.value = withSequence(
      withTiming(0.8, { duration: 80 }),
      withSpring(1.2, { damping: 10, stiffness: 400 }),
      withSpring(1.0, { damping: 15, stiffness: 300 }),
    );

    if (isCompleted) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setXpDelta(-10);
      onUntrack();
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowConfetti(true);
      setXpDelta(10);
      // Item 16: Row flash green
      rowFlash.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 400 }),
      );
      onTrack();
    }
  }, [isCompleted, onTrack, onUntrack]);

  const handleSwipeComplete = useCallback(async () => {
    if (!isCompleted) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowConfetti(true);
      setXpDelta(10);
      onTrack();
    }
  }, [isCompleted, onTrack]);

  const handleConfettiDone = useCallback(() => {
    setShowConfetti(false);
  }, []);

  const handleXpDone = useCallback(() => {
    setXpDelta(null);
  }, []);

  const router = useRouter();

  return (
    <SwipeableRow
      leftAction={{
        label: "Done",
        color: colors.feedback.success,
        onAction: handleSwipeComplete,
      }}
      rightActions={[
        {
          label: "Skip today",
          color: colors.feedback.warning,
          onAction: () => {
            if (isCompleted) onUntrack();
          },
        },
        {
          label: "Detail",
          color: colors.accent.indigo,
          onAction: () => {
            router.push(`/(main)/habits/${habit.id}` as any);
          },
        },
      ]}
    >
      <Animated.View style={rowFlashStyle}>
      <View
        style={[
          styles.row,
          isCompleted && styles.rowCompleted,
        ]}
      >
        {/* Checkbox area */}
        <Pressable onPress={handleToggle} style={styles.checkboxArea}>
          <Animated.View style={checkboxAnimStyle}>
            {isCompleted ? (
              <CheckCircle2 size={22} color={colors.status.completed} />
            ) : (
              <Circle size={22} color={colors.text.muted} />
            )}
          </Animated.View>
          {showConfetti && <ConfettiBurst onComplete={handleConfettiDone} />}
          {xpDelta !== null && (
            <XPFloat amount={xpDelta} onComplete={handleXpDone} />
          )}
        </Pressable>

        {/* Title */}
        <Text
          style={[
            styles.habitTitle,
            isCompleted && styles.habitTitleCompleted,
          ]}
          numberOfLines={1}
        >
          {habit.title}
        </Text>

        {/* Mini week dots */}
        <View style={styles.weekDots}>
          {last5Days.map((day) => {
            const isDone = completedDates?.has(day) ?? false;
            const isToday = day === todayStr;

            return (
              <View
                key={day}
                style={[
                  styles.dot,
                  isDone && styles.dotCompleted,
                  isToday && !isDone && styles.dotTodayOutline,
                ]}
              />
            );
          })}
        </View>
      </View>
      </Animated.View>
    </SwipeableRow>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  headerRow: {
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

  // Habit row
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
  },
  rowCompleted: {
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

  // Mini week dots
  weekDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border.default,
  },
  dotCompleted: {
    backgroundColor: colors.status.completed,
  },
  dotTodayOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border.default,
  },

  // Show all link
  showAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
    marginTop: 4,
  },
  showAllText: {
    fontSize: 14,
    color: colors.accent.indigo,
    fontWeight: "500",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 8,
  },
  emptyLink: {
    fontSize: 14,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
});
