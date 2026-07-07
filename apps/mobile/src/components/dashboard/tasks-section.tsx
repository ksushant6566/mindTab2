import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChevronRight, Zap } from "lucide-react-native";
import { tasksQueryOptions, useUpdateTask } from "@mindtab/core";

import { PressableCard } from "~/components/ui/pressable-card";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { UndoToast } from "~/components/ui/undo-toast";
import { colors } from "~/styles/colors";
import { api } from "~/lib/api-client";

type TasksSectionProps = {
  projectId: string | null;
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

export function TasksSection({ projectId }: TasksSectionProps) {
  const router = useRouter();
  const updateTask = useUpdateTask(api);
  const [celebrationTaskId, setCelebrationTaskId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<{
    visible: boolean;
    taskId?: string;
    previousStatus?: string;
  }>({ visible: false });

  const { data: tasks } = useQuery(
    tasksQueryOptions(api, { projectId: projectId ?? undefined })
  );

  const inProgressTasks = (tasks ?? []).filter((g) => g.status === "in_progress");
  const pendingTasks = (tasks ?? []).filter((g) => g.status === "pending");

  const displayedInProgress = inProgressTasks.slice(0, 1);
  const displayedPending = pendingTasks.slice(0, 3);
  const displayedTasks = [...displayedInProgress, ...displayedPending];


  useEffect(() => {
    if (!celebrationTaskId) return;
    const timer = setTimeout(() => {
      setCelebrationTaskId(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [celebrationTaskId]);

  const handleStatusChange = (task: any, newStatus: string) => {
    const isComplete = newStatus === "completed";
    Haptics.impactAsync(
      isComplete ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
    updateTask.mutate({
      id: task.id,
      status: newStatus,
      ...(newStatus === "completed" ? { completedAt: new Date().toISOString() } : {}),
    });
    if (isComplete) {
      setCelebrationTaskId(task.id);
    }
  };

  const handleArchive = (task: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    updateTask.mutate({ id: task.id, status: "archived" });
    setUndoState({
      visible: true,
      taskId: task.id,
      previousStatus: task.status,
    });
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>ACTIVE TASKS</Text>
        {inProgressTasks.length > 0 && (
          <Text style={styles.inProgressLabel}>
            {inProgressTasks.length} in progress
          </Text>
        )}
      </View>

      {displayedTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tasks yet</Text>
          <Pressable onPress={() => router.push("/(modals)/create-task")}>
            <Text style={styles.createLink}>Create your first task</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {displayedTasks.map((task) => {
            const nextAction = getNextStatusAction(task.status);
            const priorityKey = task.priority as string | undefined;
            const impactKey = task.impact as string | undefined;

            return (
              <SwipeableRow
                key={task.id}
                leftAction={
                  nextAction
                    ? {
                        label: nextAction.label,
                        color: nextAction.color,
                        onAction: () => handleStatusChange(task, nextAction.nextStatus),
                      }
                    : undefined
                }
                rightActions={[
                  {
                    label: "Archive",
                    color: colors.feedback.warning,
                    onAction: () => handleArchive(task),
                  },
                ]}
              >
                <PressableCard
                  onPress={() => router.push(`/(main)/tasks/${task.id}`)}
                  style={task.id === celebrationTaskId ? styles.taskCardCelebration : undefined}
                >
                  {/* Title */}
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {task.title}
                  </Text>

                  {/* Meta row: priority + impact + project */}
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
                              color:
                                impactColors[impactKey] ?? colors.impact.low,
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

                  {/* Status progress bar */}
                  <View style={styles.statusBarContainer}>
                    <View
                      style={[
                        styles.statusBarFill,
                        {
                          width: task.status === "completed" ? "100%" : task.status === "in_progress" ? "50%" : "0%",
                          backgroundColor: task.status === "completed"
                            ? colors.status.completed
                            : task.status === "in_progress"
                              ? colors.status.active
                              : colors.status.pending,
                        },
                      ]}
                    />
                  </View>
                  {task.id === celebrationTaskId && <ConfettiBurst particleCount={20} />}
                </PressableCard>
              </SwipeableRow>
            );
          })}
        </>
      )}

      {/* Show all link — always visible */}
      <Pressable
        style={styles.showAllRow}
        onPress={() => router.push("/(main)/tasks")}
      >
        <Text style={styles.showAllText}>Show all tasks</Text>
        <ChevronRight size={16} color={colors.accent.indigo} />
      </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.text.muted,
  },
  inProgressLabel: {
    fontSize: 12,
    color: colors.status.active,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  taskCardCelebration: {
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
  statusBarContainer: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border.default,
    marginTop: 12,
    overflow: "hidden",
  },
  statusBarFill: {
    height: "100%",
    borderRadius: 1,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  createLink: {
    fontSize: 14,
    color: colors.accent.indigo,
    marginTop: 4,
  },
  showAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  showAllText: {
    fontSize: 14,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
});
