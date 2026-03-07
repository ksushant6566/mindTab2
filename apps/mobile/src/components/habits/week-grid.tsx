import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type TrackerRecord = {
  habitId: string;
  date: string;
  status: string;
};

type WeekGridProps = {
  habits: Array<{ id: string; title: string }>;
  tracker: TrackerRecord[];
  onToggleDay?: (habitId: string, date: string, currentlyDone: boolean) => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CELL_SIZE = 28;
const LABEL_WIDTH = 80;
const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

function getWeekDays(weekOffset: number): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Start from Sunday of the target week
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek + weekOffset * 7);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d.toISOString().split("T")[0]!);
  }
  return days;
}

function canToggle(date: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T12:00:00");
  const diffDays = Math.floor(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays >= 0 && diffDays <= 7;
}

export function WeekGrid({ habits, tracker, onToggleDay }: WeekGridProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date().toISOString().split("T")[0]!;

  const completedSet = useMemo(
    () =>
      new Set(
        tracker
          .filter((t) => t.status === "completed")
          .map((t) => `${t.habitId}:${t.date}`),
      ),
    [tracker],
  );

  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Swipe gesture for week navigation
  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 60;

  const goToPrevWeek = useCallback(() => {
    setWeekOffset((w) => w - 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const goToNextWeek = useCallback(() => {
    if (weekOffset < 0) {
      setWeekOffset((w) => w + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [weekOffset]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.4;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(goToPrevWeek)();
      } else if (e.translationX < -SWIPE_THRESHOLD && weekOffset < 0) {
        runOnJS(goToNextWeek)();
      }
      translateX.value = withSpring(0, springs.snappy);
    });

  const gridAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleCellPress = useCallback(
    (habitId: string, date: string) => {
      if (!canToggle(date) || !onToggleDay) return;
      const done = completedSet.has(`${habitId}:${date}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggleDay(habitId, date, done);
    },
    [completedSet, onToggleDay],
  );

  if (habits.length === 0) return null;

  // Week label
  const weekStart = new Date(days[0]! + "T12:00:00");
  const weekEnd = new Date(days[6]! + "T12:00:00");
  const weekLabel = `${weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${weekEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  return (
    <View style={styles.container}>
      {/* Header with arrows */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Weekly Grid</Text>
        <View style={styles.navRow}>
          <Pressable onPress={goToPrevWeek} hitSlop={8}>
            <ChevronLeft size={18} color={colors.text.secondary} />
          </Pressable>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <Pressable
            onPress={goToNextWeek}
            hitSlop={8}
            disabled={weekOffset >= 0}
          >
            <ChevronRight
              size={18}
              color={
                weekOffset >= 0 ? colors.border.default : colors.text.secondary
              }
            />
          </Pressable>
        </View>
      </View>

      {/* Swipeable grid */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={gridAnimStyle}>
          {/* Day headers */}
          <View style={styles.dayHeaderRow}>
            <View style={{ width: LABEL_WIDTH }} />
            {days.map((day, i) => (
              <View key={day} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{dayLabels[i]}</Text>
              </View>
            ))}
          </View>

          {/* Habit rows */}
          {habits.map((habit) => (
            <View key={habit.id} style={styles.habitRow}>
              <View style={{ width: LABEL_WIDTH }}>
                <Text style={styles.habitLabel} numberOfLines={1}>
                  {habit.title}
                </Text>
              </View>
              {days.map((day) => {
                const isToday = day === today;
                const isFuture = day > today;
                const done = completedSet.has(`${habit.id}:${day}`);
                const tappable = canToggle(day) && !!onToggleDay;

                return (
                  <Pressable
                    key={day}
                    style={styles.dayHeaderCell}
                    onPress={
                      tappable
                        ? () => handleCellPress(habit.id, day)
                        : undefined
                    }
                    disabled={!tappable}
                  >
                    <View
                      style={[
                        styles.cell,
                        done && styles.cellDone,
                        isFuture && styles.cellFuture,
                        isToday && !done && styles.cellToday,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.text.muted,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weekLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "500",
    minWidth: 100,
    textAlign: "center",
  },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  dayHeaderCell: {
    width: CELL_SIZE,
    alignItems: "center",
  },
  dayHeaderText: {
    fontSize: 10,
    color: colors.text.muted,
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  habitLabel: {
    fontSize: 12,
    color: colors.text.primary,
  },
  cell: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border.default,
  },
  cellDone: {
    backgroundColor: colors.status.completed,
  },
  cellFuture: {
    backgroundColor: colors.border.subtle,
    opacity: 0.4,
  },
  cellToday: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.text.primary,
  },
});
