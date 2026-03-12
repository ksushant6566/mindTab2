import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { colors } from "~/styles/colors";
import { springs } from "~/lib/animations";

type StreakCalendarProps = {
  tracker: Array<{ habitId: string; date: string; status: string }>;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CELL_GAP = 4;
const DAYS_IN_WEEK = 7;
const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getDayColor(completed: number, total: number): string {
  if (completed === 0) return colors.border.default;
  if (total > 0 && completed >= total) return colors.xp.gold;
  return colors.streak.orange;
}

export function StreakCalendar({ tracker }: StreakCalendarProps) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<{
    date: string;
    count: number;
    total: number;
  } | null>(null);

  const targetDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset]);

  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  const completionsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tracker) {
      if (entry.status === "completed") {
        map.set(entry.date, (map.get(entry.date) ?? 0) + 1);
      }
    }
    return map;
  }, [tracker]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const totalHabits = useMemo(
    () => new Set(tracker.map((entry) => entry.habitId)).size,
    [tracker],
  );

  const monthLabel = targetDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isCurrentMonth = monthOffset === 0;

  // Swipe gesture
  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 60;

  const goToPrev = useCallback(() => {
    setMonthOffset((m) => m - 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const goToNext = useCallback(() => {
    if (!isCurrentMonth) {
      setMonthOffset((m) => m + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isCurrentMonth]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.4;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(goToPrev)();
      } else if (e.translationX < -SWIPE_THRESHOLD && !isCurrentMonth) {
        runOnJS(goToNext)();
      }
      translateX.value = withSpring(0, springs.snappy);
    });

  const gridAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Calculate cell size based on available width
  const containerPadding = 32; // 16 each side within card
  const availableWidth = SCREEN_WIDTH - 40 - containerPadding; // 20px padding each side from profile
  const cellSize = Math.floor((availableWidth - CELL_GAP * 6) / DAYS_IN_WEEK);

  const todayStr = today.toISOString().split("T")[0]!;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Streak Calendar</Text>
        <View style={styles.navRow}>
          <Pressable onPress={goToPrev} hitSlop={8}>
            <ChevronLeft size={18} color={colors.text.secondary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={goToNext} hitSlop={8} disabled={isCurrentMonth}>
            <ChevronRight
              size={18}
              color={isCurrentMonth ? colors.border.default : colors.text.secondary}
            />
          </Pressable>
        </View>
      </View>

      {/* Swipeable calendar grid */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={gridAnimStyle}>
          {/* Day labels */}
          <View style={styles.row}>
            {dayLabels.map((label, i) => (
              <View key={i} style={[styles.cell, { width: cellSize, height: 20 }]}>
                <Text style={styles.dayLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          {(() => {
            const rows: React.ReactNode[] = [];
            let dayIndex = 1;

            // Calculate number of weeks needed
            const totalCells = firstDay + daysInMonth;
            const numWeeks = Math.ceil(totalCells / 7);

            for (let week = 0; week < numWeeks; week++) {
              const cells: React.ReactNode[] = [];
              for (let dow = 0; dow < 7; dow++) {
                const cellIndex = week * 7 + dow;
                if (cellIndex < firstDay || dayIndex > daysInMonth) {
                  cells.push(
                    <View
                      key={`empty-${cellIndex}`}
                      style={[styles.cell, { width: cellSize, height: cellSize }]}
                    />
                  );
                } else {
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayIndex).padStart(2, "0")}`;
                  const count = completionsByDate.get(dateStr) ?? 0;
                  const isToday = dateStr === todayStr;

                  cells.push(
                    <Pressable
                      key={dateStr}
                      onPress={() => setSelectedDay({ date: dateStr, count, total: totalHabits })}
                      style={[styles.cell, { width: cellSize, height: cellSize }]}
                    >
                      <View
                        style={[
                          styles.dayCellInner,
                          {
                            width: cellSize - CELL_GAP,
                            height: cellSize - CELL_GAP,
                            borderRadius: 6,
                            backgroundColor: getDayColor(count, totalHabits),
                          },
                          isToday && styles.todayOutline,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumber,
                            count > 0 && styles.dayNumberActive,
                          ]}
                        >
                          {dayIndex}
                        </Text>
                      </View>
                    </Pressable>
                  );
                  dayIndex++;
                }
              }
              rows.push(
                <View key={`week-${week}`} style={styles.row}>
                  {cells}
                </View>
              );
            }
            return rows;
          })()}
        </Animated.View>
      </GestureDetector>
      {selectedDay && (
        <View style={styles.dayTooltip}>
          <Text style={styles.dayTooltipText}>
            {selectedDay.count}/{selectedDay.total} habits completed
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 16,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "500",
    minWidth: 100,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  todayOutline: {
    borderWidth: 1.5,
    borderColor: colors.text.primary,
  },
  dayLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: "500",
  },
  dayNumber: {
    fontSize: 10,
    color: colors.text.muted,
  },
  dayNumberActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  dayTooltip: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dayTooltipText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
