import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import { useState, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  habitQueryOptions,
  habitTrackerQueryOptions,
  useUpdateHabit,
  useDeleteHabit,
} from "@mindtab/core";
import * as Haptics from "expo-haptics";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  Check,
  X,
} from "lucide-react-native";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Chip } from "~/components/ui/chip";
import { PressableCard } from "~/components/ui/pressable-card";
import { ProgressBar } from "~/components/ui/progress-bar";
import { StreakFlame } from "~/components/ui/streak-flame";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

// ── Constants ──

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// ── Screen ──

export default function HabitDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: habit, isLoading } = useQuery(habitQueryOptions(api, id));
  const { data: tracker = [] } = useQuery(habitTrackerQueryOptions(api));
  const updateHabit = useUpdateHabit(api);
  const deleteHabit = useDeleteHabit(api);

  const goBack = useCallback(() => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/habits");
    }
  }, [from, router]);

  // ── Edit state ──

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFrequency, setEditFrequency] = useState<"daily" | "weekly">(
    "daily",
  );

  // ── Delete confirmation state ──

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Calendar month navigation ──

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  if (isLoading || !habit) return <Loading />;

  const h = habit as any;

  // ── Tracker data for THIS habit ──

  const habitRecords = (tracker as any[]).filter(
    (r: any) => r.habitId === id && r.status === "completed",
  );

  const completedDatesSet = new Set<string>();
  for (const r of habitRecords) {
    if (r.date) completedDatesSet.add(r.date);
  }

  // ── Streak calculation ──

  const { currentStreak, bestStreak } = useMemo(() => {
    if (completedDatesSet.size === 0)
      return { currentStreak: 0, bestStreak: 0 };

    const sorted = Array.from(completedDatesSet).sort();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0]!;

    // Current streak: walk backwards from today (or yesterday if today not done)
    let current = 0;
    const check = new Date(today);
    if (!completedDatesSet.has(todayStr)) {
      check.setDate(check.getDate() - 1);
    }
    while (true) {
      const ds = check.toISOString().split("T")[0]!;
      if (completedDatesSet.has(ds)) {
        current++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }

    // Best streak
    let best = 0;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]!);
      const curr = new Date(sorted[i]!);
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        run++;
      } else {
        if (run > best) best = run;
        run = 1;
      }
    }
    if (run > best) best = run;

    return { currentStreak: current, bestStreak: best };
  }, [completedDatesSet.size, tracker, id]);

  // ── Stats ──

  const totalCompletions = habitRecords.length;

  const createdDate = h.createdAt
    ? new Date(h.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  const completionRate = useMemo(() => {
    if (!h.createdAt) return 0;
    const created = new Date(h.createdAt);
    created.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const totalDays =
      Math.floor(
        (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    if (totalDays <= 0) return 0;
    return Math.round((totalCompletions / totalDays) * 100);
  }, [h.createdAt, totalCompletions]);

  // ── Last 30 days data ──

  const last30Days = useMemo(() => {
    const result: { date: string; status: "completed" | "missed" | "future" }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0]!;
      if (d > today) {
        result.push({ date: ds, status: "future" });
      } else if (completedDatesSet.has(ds)) {
        result.push({ date: ds, status: "completed" });
      } else {
        result.push({ date: ds, status: "missed" });
      }
    }
    return result;
  }, [completedDatesSet.size, tracker, id]);

  // ── Calendar grid data ──

  const calendarWeeks = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const grid: (string | null)[][] = [];
    let week: (string | null)[] = [];

    for (let i = 0; i < startDow; i++) {
      week.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      week.push(ds);
      if (week.length === 7) {
        grid.push(week);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      grid.push(week);
    }

    return grid;
  }, [calendarMonth]);

  // ── Edit handlers ──

  const startEditing = () => {
    setEditTitle(h.title || "");
    setEditDescription(h.description || "");
    setEditFrequency(h.frequency || "daily");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateHabit.mutate(
      {
        id,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        frequency: editFrequency,
      },
      {
        onSuccess: () => {
          toast.success("Habit updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update habit"),
      },
    );
  };

  const handleDelete = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteHabit.mutate(id, {
      onSuccess: () => goBack(),
    });
  };

  // ── Calendar navigation ──

  const goToPrevMonth = () =>
    setCalendarMonth((prev) =>
      prev.month === 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: prev.month - 1 },
    );

  const goToNextMonth = () =>
    setCalendarMonth((prev) =>
      prev.month === 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: prev.month + 1 },
    );

  // ── Today reference for calendar ──

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0]!;

  const monthPan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -60) {
        runOnJS(goToNextMonth)();
      } else if (event.translationX > 60) {
        runOnJS(goToPrevMonth)();
      }
    });

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.headerBtnLeft}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>

        {!isEditing && (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {h.title}
          </Text>
        )}
        {isEditing && (
          <Text style={styles.headerTitle} numberOfLines={1}>
            Editing
          </Text>
        )}

        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <Pressable
                onPress={cancelEditing}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <X size={20} color={colors.text.secondary} />
              </Pressable>
              <Pressable
                onPress={handleSave}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Check size={20} color={colors.feedback.success} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={startEditing}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Edit3 size={20} color={colors.text.primary} />
              </Pressable>
              <Pressable
                onPress={() => setShowDeleteConfirm(true)}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Trash2 size={20} color={colors.feedback.error} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* ── Delete confirmation bar ── */}
      {showDeleteConfirm && (
        <View style={styles.deleteBar}>
          <Text style={styles.deleteBarText}>Delete this habit?</Text>
          <View style={styles.deleteBarActions}>
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={styles.deleteBarCancelBtn}
            >
              <Text style={styles.deleteBarCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.deleteBarConfirmBtn}>
              <Text style={styles.deleteBarConfirmText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Title / Description (inline edit) ── */}
        {isEditing ? (
          <View style={styles.editSection}>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={styles.titleInput}
              placeholder="Habit title"
              placeholderTextColor={colors.text.muted}
              autoFocus
            />
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              style={styles.descriptionInput}
              placeholder="Add a description..."
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
            />

            {/* Frequency chip selector */}
            <Text style={styles.sectionLabel}>FREQUENCY</Text>
            <View style={styles.chipRow}>
              <Chip
                label="Daily"
                selected={editFrequency === "daily"}
                color={colors.accent.indigo}
                size="md"
                onPress={() => setEditFrequency("daily")}
              />
              <Chip
                label="Weekly"
                selected={editFrequency === "weekly"}
                color={colors.accent.indigo}
                size="md"
                onPress={() => setEditFrequency("weekly")}
              />
            </View>
          </View>
        ) : (
          <View style={styles.titleSection}>
            <Text style={styles.title}>{h.title}</Text>
            {h.description ? (
              <Text style={styles.description}>{h.description}</Text>
            ) : null}
          </View>
        )}

        {/* ── Streak display ── */}
        <View style={styles.streakSection}>
          <StreakFlame count={currentStreak} size={48} showCount={false} />
          <View style={styles.streakTextGroup}>
            <Text style={styles.streakCount}>{currentStreak}</Text>
            <Text style={styles.streakUnit}>
              day{currentStreak !== 1 ? "s" : ""} streak
            </Text>
          </View>
          <Text style={styles.bestStreakText}>
            Best: {bestStreak} day{bestStreak !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* ── Stats cards row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {h.frequency === "daily" ? "Daily" : "Weekly"}
            </Text>
            <Text style={styles.statLabel}>Frequency</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{createdDate}</Text>
            <Text style={styles.statLabel}>Created</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalCompletions}</Text>
            <Text style={styles.statLabel}>Completions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{completionRate}%</Text>
            <Text style={styles.statLabel}>Rate</Text>
            <View style={styles.statProgressBar}>
              <ProgressBar
                value={completionRate / 100}
                color={colors.feedback.success}
                height={3}
              />
            </View>
          </View>
        </View>

        {/* ── Last 30 days streak bar ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Last 30 Days</Text>
          <View style={styles.streakBarRow}>
            {last30Days.map((day) => (
              <View
                key={day.date}
                style={[
                  styles.streakDot,
                  day.status === "completed" && styles.streakDotCompleted,
                  day.status === "missed" && styles.streakDotMissed,
                  day.status === "future" && styles.streakDotFuture,
                ]}
              />
            ))}
          </View>
          <View style={styles.streakBarLegend}>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.feedback.success }]}
              />
              <Text style={styles.legendText}>Completed</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.border.default }]}
              />
              <Text style={styles.legendText}>Missed</Text>
            </View>
          </View>
        </View>

        {/* ── Monthly calendar grid ── */}
        <View style={styles.sectionContainer}>
          {/* Calendar header with month navigation */}
          <GestureDetector gesture={monthPan}>
            <View>
              <View style={styles.calendarHeader}>
                <Pressable onPress={goToPrevMonth} hitSlop={8}>
                  <ChevronLeft size={20} color={colors.text.secondary} />
                </Pressable>
                <Text style={styles.calendarMonthText}>
                  {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                </Text>
                <Pressable onPress={goToNextMonth} hitSlop={8}>
                  <ChevronRight size={20} color={colors.text.secondary} />
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.weekdayLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              {calendarWeeks.map((week, wi) => (
                <View key={wi} style={styles.calendarWeekRow}>
                  {week.map((dateStr, di) => {
                    if (!dateStr) {
                      return <View key={`empty-${di}`} style={styles.calendarDayCell} />;
                    }

                    const dayNum = parseInt(dateStr.split("-")[2]!, 10);
                    const isDone = completedDatesSet.has(dateStr);
                    const isToday = dateStr === todayStr;
                    const isFuture = new Date(dateStr) > today;

                    return (
                      <View key={dateStr} style={styles.calendarDayCell}>
                        <View
                          style={[
                            styles.calendarDayCircle,
                            isDone && styles.calendarDayDone,
                            isToday && !isDone && styles.calendarDayToday,
                            isFuture && styles.calendarDayFuture,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarDayNum,
                              isDone && styles.calendarDayNumDone,
                              isFuture && styles.calendarDayNumFuture,
                              !isDone &&
                                !isFuture &&
                                !isToday &&
                                styles.calendarDayNumMissed,
                            ]}
                          >
                            {dayNum}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </GestureDetector>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>CONNECTED NOTES</Text>
          <Text style={styles.connectedNotesText}>
            Note-to-habit mention queries still require API support. Connected notes will appear here once available.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  headerBtnLeft: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    padding: 6,
  },

  // ── Delete confirmation bar ──
  deleteBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.feedback.errorMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  deleteBarText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.feedback.error,
  },
  deleteBarActions: {
    flexDirection: "row",
    gap: 12,
  },
  deleteBarCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
  },
  deleteBarCancelText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.secondary,
  },
  deleteBarConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.feedback.error,
  },
  deleteBarConfirmText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },

  // ── Scroll content ──
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },

  // ── Title section (view mode) ──
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  description: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },

  // ── Edit section ──
  editSection: {
    marginBottom: 24,
  },
  titleInput: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.focus,
    paddingBottom: 8,
  },
  descriptionInput: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    marginBottom: 16,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border.focus,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.bg.surface,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: colors.text.muted,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
  },

  // ── Streak section ──
  streakSection: {
    alignItems: "center",
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  streakTextGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 8,
  },
  streakCount: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: -1,
  },
  streakUnit: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.secondary,
  },
  bestStreakText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },

  // ── Stats row ──
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "500",
  },
  statProgressBar: {
    marginTop: 8,
  },

  // ── Last 30 days bar ──
  sectionContainer: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 12,
  },
  streakBarRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  streakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.default,
  },
  streakDotCompleted: {
    backgroundColor: colors.feedback.success,
  },
  streakDotMissed: {
    backgroundColor: colors.border.default,
  },
  streakDotFuture: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  streakBarLegend: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  connectedNotesText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },

  // ── Monthly calendar ──
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  calendarDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 3,
  },
  calendarDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayDone: {
    backgroundColor: colors.feedback.success,
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: colors.accent.indigo,
  },
  calendarDayFuture: {
    opacity: 0.3,
  },
  calendarDayNum: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  calendarDayNumDone: {
    color: "#ffffff",
    fontWeight: "600",
  },
  calendarDayNumFuture: {
    color: colors.text.muted,
  },
  calendarDayNumMissed: {
    color: colors.text.secondary,
  },
});
