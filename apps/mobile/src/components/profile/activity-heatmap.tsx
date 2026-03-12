import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ScrollView } from "react-native";
import { colors } from "~/styles/colors";

type ActivityHeatmapProps = {
  tracker: Array<{ habitId: string; date: string; status: string }>;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const WEEKS = 52;
const CELL_SIZE = 10;
const CELL_GAP = 2;
const LABEL_WIDTH = 24;

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getHeatColor(count: number): string {
  if (count === 0) return "transparent";
  if (count <= 1) return "rgba(129,140,248,0.2)";
  if (count <= 2) return "rgba(129,140,248,0.4)";
  if (count <= 4) return "rgba(34,197,94,0.4)";
  if (count <= 6) return "rgba(34,197,94,0.6)";
  return "rgba(34,197,94,0.9)";
}

export function ActivityHeatmap({ tracker }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const completionsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tracker) {
      if (entry.status === "completed") {
        map.set(entry.date, (map.get(entry.date) ?? 0) + 1);
      }
    }
    return map;
  }, [tracker]);

  // Build 365-day grid: columns = weeks, rows = days of week (Sun-Sat)
  const { grid, monthPositions } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Go back ~52 weeks
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (WEEKS * 7 - 1) - today.getDay());

    const weeks: Array<Array<{ date: string; count: number } | null>> = [];
    const monthPos: Array<{ month: number; weekIndex: number }> = [];
    let currentMonth = -1;

    let d = new Date(startDate);
    let weekIndex = 0;
    let currentWeek: Array<{ date: string; count: number } | null> = [];

    while (d <= today || currentWeek.length > 0) {
      const dayOfWeek = d.getDay();

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        // Pad last week
        while (currentWeek.length < 7) currentWeek.push(null);
        weeks.push(currentWeek);
        currentWeek = [];
        weekIndex++;
      }

      if (d > today) {
        if (currentWeek.length > 0) {
          while (currentWeek.length < 7) currentWeek.push(null);
          weeks.push(currentWeek);
        }
        break;
      }

      const dateStr = d.toISOString().split("T")[0]!;
      const count = completionsByDate.get(dateStr) ?? 0;

      // Track month boundaries
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        monthPos.push({ month: currentMonth, weekIndex });
      }

      currentWeek.push({ date: dateStr, count });
      d.setDate(d.getDate() + 1);
    }

    return { grid: weeks, monthPositions: monthPos };
  }, [completionsByDate]);

  const totalCompletions = useMemo(() => {
    let total = 0;
    completionsByDate.forEach((count) => (total += count));
    return total;
  }, [completionsByDate]);

  const handleCellPress = useCallback((date: string, count: number, weekIdx: number, dayIdx: number) => {
    const x = LABEL_WIDTH + weekIdx * (CELL_SIZE + CELL_GAP);
    const y = dayIdx * (CELL_SIZE + CELL_GAP);
    setTooltip({ date, count, x, y });
    setTimeout(() => setTooltip(null), 2000);
  }, []);

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.totalLabel}>{totalCompletions} completions</Text>
      </View>

      <View style={styles.gridWrapper}>
        {/* Month labels */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.monthLabelRow, { marginLeft: LABEL_WIDTH }]}>
              {monthPositions.map((mp, i) => (
                <Text
                  key={i}
                  style={[
                    styles.monthLabel,
                    { position: "absolute", left: mp.weekIndex * (CELL_SIZE + CELL_GAP) },
                  ]}
                >
                  {monthLabels[mp.month]}
                </Text>
              ))}
            </View>

            <View style={styles.gridContainer}>
              <View style={[styles.dayLabelsCol, { width: LABEL_WIDTH }]}>
                {["", "M", "", "W", "", "F", ""].map((label, i) => (
                  <View key={i} style={{ height: CELL_SIZE + CELL_GAP, justifyContent: "center" }}>
                    <Text style={styles.dayLabelText}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.weeksRow}>
                {grid.map((week, weekIdx) => (
                  <View key={weekIdx} style={styles.weekCol}>
                    {week.map((cell, dayIdx) => (
                      <Pressable
                        key={dayIdx}
                        onPress={
                          cell
                            ? () => handleCellPress(cell.date, cell.count, weekIdx, dayIdx)
                            : undefined
                        }
                      >
                        <View
                          style={[
                            styles.heatCell,
                            {
                              width: CELL_SIZE,
                              height: CELL_SIZE,
                              backgroundColor: cell ? getHeatColor(cell.count) : "transparent",
                            },
                          ]}
                        />
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Tooltip */}
        {tooltip && (
          <View style={[styles.tooltip, { left: tooltip.x, top: tooltip.y - 28 }]}>
            <Text style={styles.tooltipText}>
              Habits: {tooltip.count} on {formatTooltipDate(tooltip.date)}
            </Text>
          </View>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>Less</Text>
        {[0, 1, 2, 4, 7].map((level) => (
          <View
            key={level}
            style={[
              styles.legendCell,
              { backgroundColor: getHeatColor(level) },
            ]}
          />
        ))}
        <Text style={styles.legendLabel}>More</Text>
      </View>
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
  totalLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  gridWrapper: {
    position: "relative",
    overflow: "hidden",
  },
  monthLabelRow: {
    height: 16,
    position: "relative",
    marginBottom: 4,
  },
  monthLabel: {
    fontSize: 9,
    color: colors.text.muted,
  },
  gridContainer: {
    flexDirection: "row",
  },
  dayLabelsCol: {
    justifyContent: "flex-start",
  },
  dayLabelText: {
    fontSize: 9,
    color: colors.text.muted,
  },
  weeksRow: {
    flexDirection: "row",
    gap: CELL_GAP,
  },
  weekCol: {
    gap: CELL_GAP,
  },
  heatCell: {
    borderRadius: 2,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
  },
  tooltipText: {
    fontSize: 10,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  legendLabel: {
    fontSize: 10,
    color: colors.text.muted,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
