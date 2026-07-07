import React, { useState, useMemo, useCallback, useEffect } from "react";
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
import { Target, Zap, Archive, ChevronDown } from "lucide-react-native";
import {
  tasksQueryOptions,
  useUpdateTask,
  useArchiveCompletedTasks,
} from "@mindtab/core";

import { ProjectPills } from "~/components/dashboard/project-pills";
import { Chip } from "~/components/ui/chip";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { EmptyState } from "~/components/ui/empty-state";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { UndoToast } from "~/components/ui/undo-toast";
import { ListHeader } from "~/components/list-header";
import { FAB } from "~/components/dashboard/fab";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

// ---------- Constants ----------

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "Active" },
  { key: "completed", label: "Done" },
  { key: "archived", label: "Archived" },
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

type TaskSection = {
  status: string;
  title: string;
  color: string;
  data: any[];
  count: number;
};

const keyExtractor = (item: any) => item.id;

// ---------- Memoized task row ----------

const TaskRow = React.memo(function TaskRow({
  task,
  onPress,
  onStatusChange,
  onArchive,
  isCelebrating,
}: {
  task: any;
  onPress: (id: string) => void;
  onStatusChange: (task: any, newStatus: string) => void;
  onArchive: (task: any) => void;
  isCelebrating: boolean;
}) {
  const priorityKey = task.priority as string | undefined;
  const impactKey = task.impact as string | undefined;

  const handlePress = useCallback(() => onPress(task.id), [task.id, onPress]);

  const leftAction = useMemo(() => {
    const nextAction = getNextStatusAction(task.status);
    return nextAction
      ? {
          label: nextAction.label,
          color: nextAction.color,
          onAction: () => onStatusChange(task, nextAction.nextStatus),
        }
      : undefined;
  }, [task, onStatusChange]);

  const rightActions = useMemo(
    () => [
      {
        label: "Archive",
        color: colors.feedback.warning,
        onAction: () => onArchive(task),
      },
    ],
    [task, onArchive],
  );

  return (
    <SwipeableRow leftAction={leftAction} rightActions={rightActions}>
      <PressableCard
        onPress={handlePress}
        style={isCelebrating ? styles.taskCelebrationCard : undefined}
      >
        <Text style={styles.taskTitle} numberOfLines={1}>
          {task.title}
        </Text>

        <View style={styles.metaRow}>
          {priorityKey && priorityLabels[priorityKey] && (
            <View
              style={[
                styles.priorityPill,
                {
                  backgroundColor:
                    (priorityColors[priorityKey] ?? colors.priority.p4) + "33",
                },
              ]}
            >
              <Text
                style={[
                  styles.priorityText,
                  {
                    color: priorityColors[priorityKey] ?? colors.priority.p4,
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

          {(task as any).project?.name && (
            <Text style={styles.projectName}>
              {(task as any).project.name}
            </Text>
          )}
        </View>
        {isCelebrating && <ConfettiBurst particleCount={20} />}
      </PressableCard>
    </SwipeableRow>
  );
});

// ---------- Screen ----------

export default function TasksScreen() {
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [celebrationTaskId, setCelebrationTaskId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<{
    visible: boolean;
    taskId?: string;
    previousStatus?: string;
  }>({ visible: false });

  const projectId = selectedProjectId ?? undefined;
  const includeArchived = statusFilter === "archived";
  const { data: tasks, isLoading, refetch } = useQuery(
    tasksQueryOptions(api, { projectId, includeArchived }),
  );

  const updateTask = useUpdateTask(api);
  const archiveCompleted = useArchiveCompletedTasks(api);

  // Filter by status (archived tasks are excluded unless explicitly filtered)
  const filteredTasks = useMemo(() => {
    const list = tasks ?? [];
    return list.filter((g: any) => {
      const matchesStatus = statusFilter === "all" ? true : g.status === statusFilter;
      const hideArchived = statusFilter === "all" && g.status === "archived";
      return matchesStatus && !hideArchived;
    });
  }, [tasks, statusFilter]);

  useEffect(() => {
    if (!celebrationTaskId) return;
    const timer = setTimeout(() => {
      setCelebrationTaskId(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [celebrationTaskId]);

  // Group into sections by status
  const sections: TaskSection[] = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const task of filteredTasks) {
      const s = (task as any).status ?? "pending";
      if (!groups[s]) groups[s] = [];
      groups[s]!.push(task);
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
  }, [filteredTasks, collapsedSections]);

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
    (task: any, newStatus: string) => {
      const isComplete = newStatus === "completed";
      Haptics.impactAsync(
        isComplete ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
      );
      updateTask.mutate({
        id: task.id,
        status: newStatus,
        ...(newStatus === "completed"
          ? { completedAt: new Date().toISOString() }
          : {}),
      });
      if (isComplete) {
        setCelebrationTaskId(task.id);
      }
    },
    [updateTask],
  );

  const handleArchive = useCallback(
    (task: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateTask.mutate({ id: task.id, status: "archived" });
      setUndoState({
        visible: true,
        taskId: task.id,
        previousStatus: task.status,
      });
    },
    [updateTask],
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

  // Stable callbacks for TaskRow
  const handleTaskPress = useCallback((id: string) => {
    router.push(`/(main)/tasks/${id}`);
  }, [router]);

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
            <View
              style={{
                transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }],
              }}
            >
              <ChevronDown size={16} color={colors.text.muted} />
            </View>
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
    ({ item: task }: { item: any }) => (
      <TaskRow
        task={task}
        onPress={handleTaskPress}
        onStatusChange={handleStatusChange}
        onArchive={handleArchive}
        isCelebrating={task.id === celebrationTaskId}
      />
    ),
    [handleTaskPress, handleStatusChange, handleArchive, celebrationTaskId],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={Target}
        title="No tasks yet"
        description="Create your first task to start tracking progress"
      />
    );
  }, [isLoading]);

  // ---------- Subtitle ----------

  const inProgressCount = useMemo(
    () => (tasks ?? []).filter((g: any) => g.status === "in_progress").length,
    [tasks],
  );
  const taskSubtitle = inProgressCount > 0
    ? `${inProgressCount} in progress`
    : `${(tasks ?? []).length} tasks`;

  // ---------- Layout ----------

  return (
    <View style={styles.screen}>
      <ListHeader title="Tasks" subtitle={taskSubtitle} searchContext="tasks" />
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        removeClippedSubviews
        maxToRenderPerBatch={5}
        initialNumToRender={8}
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
      <UndoToast
        message="Task archived"
        visible={undoState.visible}
        onUndo={() => {
          if (!undoState.taskId) return;
          updateTask.mutate({
            id: undoState.taskId,
            status: undoState.previousStatus ?? "pending",
          });
          setUndoState({ visible: false });
        }}
        onDismiss={() => setUndoState({ visible: false })}
      />
      <FAB visible contextFilter="task" />
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
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
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
  // Task card
  taskTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  taskCelebrationCard: {
    borderColor: colors.status.completed,
    shadowColor: colors.status.completed,
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
    fontSize: 12,
    fontWeight: "600",
  },
  impactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  impactText: {
    fontSize: 12,
    fontWeight: "500",
  },
  projectName: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
