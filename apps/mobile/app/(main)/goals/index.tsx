import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  SectionList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Target, Zap, Archive, ChevronDown, Search, Settings } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { XPFloat } from "~/components/ui/xp-float";
import { UndoToast } from "~/components/ui/undo-toast";
import { ListHeader } from "~/components/list-header";
import { FAB } from "~/components/dashboard/fab";
import { api } from "~/lib/api-client";
import { staggerDelay } from "~/lib/animations";
import { XP_VALUES } from "~/lib/xp";
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

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------- Screen ----------

export default function GoalsScreen() {
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [celebrationGoalId, setCelebrationGoalId] = useState<string | null>(null);
  const [xpDelta, setXpDelta] = useState(0);
  const [undoState, setUndoState] = useState<{
    visible: boolean;
    goalId?: string;
    previousStatus?: string;
  }>({ visible: false });
  const debouncedSearch = useDebounce(searchQuery, 300);

  const projectId = selectedProjectId ?? undefined;
  const { data: goals, isLoading, refetch } = useQuery(
    goalsQueryOptions(api, { projectId }),
  );

  const updateGoal = useUpdateGoal(api);
  const archiveCompleted = useArchiveCompletedGoals(api);

  // Filter by status
  const filteredGoals = useMemo(() => {
    const list = goals ?? [];
    return list.filter((g: any) => {
      const matchesStatus = statusFilter === "all" ? true : g.status === statusFilter;
      const matchesArchive = showArchived || g.status !== "archived";
      const matchesSearch = debouncedSearch
        ? g.title?.toLowerCase().includes(debouncedSearch.toLowerCase())
        : true;
      return matchesStatus && matchesArchive && matchesSearch;
    });
  }, [goals, statusFilter, showArchived, debouncedSearch]);

  useEffect(() => {
    if (!celebrationGoalId) return;
    const timer = setTimeout(() => {
      setCelebrationGoalId(null);
      setXpDelta(0);
    }, 1200);
    return () => clearTimeout(timer);
  }, [celebrationGoalId]);

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
    (goal: any, newStatus: string) => {
      const isComplete = newStatus === "completed";
      Haptics.impactAsync(
        isComplete ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
      );
      updateGoal.mutate({
        id: goal.id,
        status: newStatus,
        ...(newStatus === "completed"
          ? { completedAt: new Date().toISOString() }
          : {}),
      });
      if (isComplete) {
        const awardedXP =
          goal.priority === "priority_1"
            ? XP_VALUES.GOAL_P1_COMPLETE
            : goal.impact === "high"
              ? XP_VALUES.GOAL_HIGH_IMPACT_COMPLETE
              : XP_VALUES.GOAL_COMPLETE;
        setXpDelta(awardedXP);
        setCelebrationGoalId(goal.id);
      }
    },
    [updateGoal],
  );

  const handleArchive = useCallback(
    (goal: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateGoal.mutate({ id: goal.id, status: "archived" });
      setUndoState({
        visible: true,
        goalId: goal.id,
        previousStatus: goal.status,
      });
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
            <Animated.View
              style={{
                transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }],
              }}
            >
              <ChevronDown size={16} color={colors.text.muted} />
            </Animated.View>
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
    ({ item: goal, index }: { item: any; index: number }) => {
      const nextAction = getNextStatusAction(goal.status);
      const priorityKey = goal.priority as string | undefined;
      const impactKey = goal.impact as string | undefined;

      return (
        <Animated.View entering={FadeInDown.delay(staggerDelay(index)).duration(200)}>
          <SwipeableRow
            leftAction={
              nextAction
                ? {
                    label: nextAction.label,
                    color: nextAction.color,
                    onAction: () =>
                      handleStatusChange(goal, nextAction.nextStatus),
                  }
                : undefined
            }
            rightActions={[
              {
                label: "Archive",
                color: colors.feedback.warning,
                onAction: () => handleArchive(goal),
              },
            ]}
        >
          <PressableCard
            onPress={() => router.push(`/(main)/goals/${goal.id}`)}
            style={goal.id === celebrationGoalId ? styles.goalCelebrationCard : undefined}
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
            {goal.id === celebrationGoalId && <ConfettiBurst particleCount={20} />}
            {goal.id === celebrationGoalId && xpDelta > 0 && (
              <XPFloat amount={xpDelta} onComplete={() => setXpDelta(0)} />
            )}
          </PressableCard>
          </SwipeableRow>
        </Animated.View>
      );
    },
    [handleStatusChange, handleArchive, router, celebrationGoalId, xpDelta],
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

  // ---------- Subtitle ----------

  const inProgressCount = useMemo(
    () => (goals ?? []).filter((g: any) => g.status === "in_progress").length,
    [goals],
  );
  const goalSubtitle = inProgressCount > 0
    ? `${inProgressCount} in progress`
    : `${(goals ?? []).length} goals`;

  // ---------- Layout ----------

  return (
    <View style={styles.screen}>
      <ListHeader title="Goals" subtitle={goalSubtitle} searchContext="goals" />
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
            <View style={styles.toolsRow}>
              <View style={styles.searchRow}>
                <Search size={16} color={colors.text.muted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search goals..."
                  placeholderTextColor={colors.text.muted}
                  style={styles.searchInput}
                />
              </View>
              <Pressable
                style={styles.settingsButton}
                onPress={() => setShowArchived((value) => !value)}
              >
                <Settings size={16} color={colors.text.secondary} />
                <Text style={styles.settingsText}>
                  {showArchived ? "Hide archived" : "Show archived"}
                </Text>
              </Pressable>
            </View>
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
      <UndoToast
        message="Goal archived"
        visible={undoState.visible}
        onUndo={() => {
          if (!undoState.goalId) return;
          updateGoal.mutate({
            id: undoState.goalId,
            status: undoState.previousStatus ?? "pending",
          });
          setUndoState({ visible: false });
        }}
        onDismiss={() => setUndoState({ visible: false })}
      />
      <FAB visible contextFilter="goal" />
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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  toolsRow: {
    gap: 10,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    paddingVertical: 10,
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingsText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  listContent: {
    paddingHorizontal: 20,
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
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
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
  goalCelebrationCard: {
    borderColor: colors.xp.gold,
    shadowColor: colors.xp.gold,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
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
