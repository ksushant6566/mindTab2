import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Target, CheckSquare, FileText } from "lucide-react-native";
import { colors } from "~/styles/colors";

type StatsCardsProps = {
  goals: Array<{ id: string; status?: string | null }>;
  habits: Array<{ id: string; title: string }>;
  tracker: Array<{ habitId: string; date: string; status: string }>;
  notesCount: number;
};

export function StatsCards({ goals, habits, tracker, notesCount }: StatsCardsProps) {
  const goalsCompleted = useMemo(
    () => goals.filter((g) => g.status === "completed").length,
    [goals],
  );

  const topHabit = useMemo(() => {
    if (habits.length === 0) return null;
    const counts = new Map<string, number>();
    for (const entry of tracker) {
      if (entry.status === "completed") {
        counts.set(entry.habitId, (counts.get(entry.habitId) ?? 0) + 1);
      }
    }
    let maxId = "";
    let maxCount = 0;
    counts.forEach((count, id) => {
      if (count > maxCount) {
        maxId = id;
        maxCount = count;
      }
    });
    const habit = habits.find((h) => h.id === maxId);
    return habit ? { title: habit.title, count: maxCount } : null;
  }, [habits, tracker]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Stats</Text>
      <View style={styles.grid}>
        {/* Goals completed */}
        <View style={styles.statCard}>
          <Target size={20} color={colors.accent.indigo} />
          <Text style={styles.statValue}>{goalsCompleted}</Text>
          <Text style={styles.statLabel}>Goals completed</Text>
        </View>

        {/* Notes written */}
        <View style={styles.statCard}>
          <FileText size={20} color={colors.accent.indigo} />
          <Text style={styles.statValue}>{notesCount}</Text>
          <Text style={styles.statLabel}>Notes written</Text>
        </View>

        {/* Top habit */}
        <View style={[styles.statCard, styles.statCardWide]}>
          <CheckSquare size={20} color={colors.status.completed} />
          {topHabit ? (
            <>
              <Text style={styles.statValue} numberOfLines={1}>
                {topHabit.title}
              </Text>
              <Text style={styles.statLabel}>
                Top habit ({topHabit.count} days)
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>Top habit</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 14,
    gap: 6,
  },
  statCardWide: {
    minWidth: "100%",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
