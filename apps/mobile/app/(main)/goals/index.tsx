import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  SectionList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Target, Zap, Archive } from "lucide-react-native";
import {
  goalsQueryOptions,
  useUpdateGoal,
  useArchiveCompletedGoals,
} from "@mindtab/core";

import { ProjectPills } from "~/components/dashboard/project-pills";
import { Chip } from "~/components/ui/chip";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { EmptyState } from "~/components/ui/empty-state";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

// ---------- Constants ----------

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "Active" },
  { key: "completed", label: "Done" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: colors.status.pending },
  in_progress: { label: "In Progress", color: colors.status.active },
  completed: { label: "Completed", color: colors.status.completed },
  archived: { label: "Archived", color: colors.status.archived },
};

const priorityLabels: Record<string, string> = {
  priority_1: "P1",
  priority_2: "P2",
  priority_3: "P3",
  priority_4: "P4",
};

const priorityColors: Record<string, string> = {
  priority_1: colors.priority.p1,
  priority_2: colors.priority.p2,
  priority_3: colors.priority.p3,
  priority_4: colors.priority.p4,
};

const impactLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const impactColors: Record<string, string> = {
  low: colors.impact.low,
  medium: colors.impact.medium,
  high: colors.impact.high,
};

function getNextStatusAction(status: string): {
  label: string;
  color: string;
  nextStatus: string;
} | null {
  if (status === "pending") {
    return { label: "Start", color: colors.status.active, nextStatus: "in_progress" };
  }
  if (status === "in_progress") {
    return { label: "Done", color: colors.status.completed, nextStatus: "completed" };
  }
  return null;
}

// ---------- Section types ----------

type GoalSection = {
  status: string;
  title: string;
  color: string;
  data: any[];
  count: number;
};

// ---------- Screen ----------

export default function GoalsScreen() {
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const projectId = selectedProjectId ?? undefined;
  const { data: goals, isLoading, refetch } = useQuery(
    goalsQueryOptions(api, { projectId }),
  );

  const updateGoal = useUpdateGoal(api);
  const archiveCompleted = useArchiveCompletedGoals(api);

  // Filter by status
  const filteredGoals = useMemo(() => {
    const list = goals ?? [];
    if (statusFilter === "all") return list;
    return list.filter((g: any) => g.status === statusFilter);
  }, [goals, statusFilter]);

  // Group into sections by status
  const sections: GoalSection[] = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const goal of filteredGoals) {
      const s = (goal as any).status ?? "pending";
      if (!groups[s]) groups[s] = [];
      groups[s]!.push(goal);
    }

    const order = ["in_progress", "pending", "completed", "archived"];
    return order
      .filter((s) => groups[s] && groups[s]!.length > 0)
      .map((s) => ({
        status: s,
        title: STATUS_DISPLAY[s]?.label ?? s,
        color: STATUS_DISPLAY[s]?.color ?? colors.text.muted,
        data: collapsedSections.has(s) ? [] : groups[s]!,
        count: groups[s]!.length,
      }));
  }, [filteredGoals, collapsedSections]);

  const toggleSection = useCallback((status: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(
    (goalId: string, newStatus: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateGoal.mutate({
        id: goalId,
        status: newStatus,
        ...(newStatus === "completed"
          ? { completedAt: new Date().toISOString() }
          : {}),
      });
    },
    [updateGoal],
  );

  const handleArchive = useCallback(
    (goalId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateGoal.mutate({ id: goalId, status: "archived" });
    },
    [updateGoal],
  );

  const handleArchiveAllCompleted = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    archiveCompleted.mutate();
  }, [archiveCompleted]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ---------- Renderers ----------

  const renderSectionHeader = useCallback(
    ({ section }: { section: any }) => {
      const isCollapsed = collapsedSections.has(section.status);
      const count = section.count ?? section.data.length;
      const isCompleted = section.status === "completed";

      return (
        <View style={styles.sectionHeaderRow}>
          <Pressable
            style={styles.sectionHeaderPressable}
            onPress={() => toggleSection(section.status)}
          >
            <View
              style={[styles.sectionDot, { backgroundColor: section.color }]}
            />
            <Text style={styles.sectionHeaderText}>
              {section.title} ({count})
            </Text>
            <Text style={styles.chevron}>{isCollapsed ? "+" : "-"}</Text>
          </Pressable>

          {isCompleted && count > 0 && (
            <Pressable
              style={styles.archiveAllButton}
              onPress={handleArchiveAllCompleted}
            >
              <Archive size={14} color={colors.feedback.warning} />
              <Text style={styles.archiveAllText}>Archive all</Text>
            </Pressable>
          )}
        </View>
      );
    },
    [collapsedSections, toggleSection, handleArchiveAllCompleted],
  );

  const renderItem = useCallback(
    ({ item: goal }: { item: any }) => {
      const nextAction = getNextStatusAction(goal.status);
      const priorityKey = goal.priority as string | undefined;
      const impactKey = goal.impact as string | undefined;

      return (
        <SwipeableRow
          leftAction={
            nextAction
              ? {
                  label: nextAction.label,
                  color: nextAction.color,
                  onAction: () =>
                    handleStatusChange(goal.id, nextAction.nextStatus),
                }
              : undefined
          }
          rightActions={[
            {
              label: "Archive",
              color: colors.feedback.warning,
              onAction: () => handleArchive(goal.id),
            },
          ]}
        >
          <PressableCard
            onPress={() => router.push(`/(main)/goals/${goal.id}`)}
          >
            {/* Title */}
            <Text style={styles.goalTitle} numberOfLines={1}>
              {goal.title}
            </Text>

            {/* Meta: priority pill + impact + project */}
            <View style={styles.metaRow}>
              {priorityKey && priorityLabels[priorityKey] && (
                <View
                  style={[
                    styles.priorityPill,
                    {
                      backgroundColor:
                        (priorityColors[priorityKey] ?? colors.priority.p4) +
                        "33",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      {
                        color:
                          priorityColors[priorityKey] ?? colors.priority.p4,
                      },
                    ]}
                  >
                    {priorityLabels[priorityKey]}
                  </Text>
                </View>
              )}

              {impactKey && impactLabels[impactKey] && (
                <View style={styles.impactRow}>
                  <Zap
                    size={12}
                    color={impactColors[impactKey] ?? colors.impact.low}
                  />
                  <Text
                    style={[
                      styles.impactText,
                      {
                        color: impactColors[impactKey] ?? colors.impact.low,
                      },
                    ]}
                  >
                    {impactLabels[impactKey]}
                  </Text>
                </View>
              )}

              {(goal as any).project?.name && (
                <Text style={styles.projectName}>
                  {(goal as any).project.name}
                </Text>
              )}
            </View>
          </PressableCard>
        </SwipeableRow>
      );
    },
    [handleStatusChange, handleArchive, router],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Create your first goal to start tracking progress"
      />
    );
  }, [isLoading]);

  // ---------- Layout ----------

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ProjectPills
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  selected={statusFilter === f.key}
                  onPress={() => setStatusFilter(f.key)}
                  color={colors.accent.indigo}
                  size="sm"
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.indigo}
          />
        }
      />
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  // Section header
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 8,
  },
  sectionHeaderPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chevron: {
    fontSize: 16,
    color: colors.text.muted,
    marginLeft: 4,
  },
  archiveAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.feedback.warning + "1A",
  },
  archiveAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.feedback.warning,
  },
  // Goal card
  goalTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  impactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  impactText: {
    fontSize: 11,
    fontWeight: "500",
  },
  projectName: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
