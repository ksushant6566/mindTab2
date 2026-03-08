import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChevronRight, Zap } from "lucide-react-native";
import { goalsQueryOptions, useUpdateGoal } from "@mindtab/core";

import { PressableCard } from "~/components/ui/pressable-card";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { XPFloat } from "~/components/ui/xp-float";
import { UndoToast } from "~/components/ui/undo-toast";
import { XP_VALUES } from "~/lib/xp";
import { colors } from "~/styles/colors";
import { api } from "~/lib/api-client";

type GoalsSectionProps = {
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

const statusOrder: Record<string, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

function getStatusDots(status: string) {
  const level = statusOrder[status] ?? 0;
  return [
    { filled: level >= 0, color: colors.status.pending },
    { filled: level >= 1, color: colors.status.active },
    { filled: level >= 2, color: colors.status.completed },
  ];
}

function getGoalXP(goal: any) {
  if (goal.priority === "priority_1") return XP_VALUES.GOAL_P1_COMPLETE;
  if (goal.impact === "high") return XP_VALUES.GOAL_HIGH_IMPACT_COMPLETE;
  return XP_VALUES.GOAL_COMPLETE;
}

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

export function GoalsSection({ projectId }: GoalsSectionProps) {
  const router = useRouter();
  const updateGoal = useUpdateGoal(api);
  const [celebrationGoalId, setCelebrationGoalId] = useState<string | null>(null);
  const [xpDelta, setXpDelta] = useState(0);
  const [undoState, setUndoState] = useState<{
    visible: boolean;
    goalId?: string;
    previousStatus?: string;
  }>({ visible: false });

  const { data: goals } = useQuery(
    goalsQueryOptions(api, { projectId: projectId ?? undefined })
  );

  const inProgressGoals = (goals ?? []).filter((g) => g.status === "in_progress");
  const pendingGoals = (goals ?? []).filter((g) => g.status === "pending");

  const displayedInProgress = inProgressGoals.slice(0, 1);
  const displayedPending = pendingGoals.slice(0, 3);
  const displayedGoals = [...displayedInProgress, ...displayedPending];

  const remainingPendingCount = pendingGoals.length - displayedPending.length;

  useEffect(() => {
    if (!celebrationGoalId) return;
    const timer = setTimeout(() => {
      setCelebrationGoalId(null);
      setXpDelta(0);
    }, 1200);
    return () => clearTimeout(timer);
  }, [celebrationGoalId]);

  const handleStatusChange = (goal: any, newStatus: string) => {
    const isComplete = newStatus === "completed";
    Haptics.impactAsync(
      isComplete ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
    updateGoal.mutate({
      id: goal.id,
      status: newStatus,
      ...(newStatus === "completed" ? { completedAt: new Date().toISOString() } : {}),
    });
    if (isComplete) {
      setXpDelta(getGoalXP(goal));
      setCelebrationGoalId(goal.id);
    }
  };

  const handleArchive = (goal: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateGoal.mutate({ id: goal.id, status: "archived" });
    setUndoState({
      visible: true,
      goalId: goal.id,
      previousStatus: goal.status,
    });
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>ACTIVE GOALS</Text>
        {inProgressGoals.length > 0 && (
          <Text style={styles.inProgressLabel}>
            {inProgressGoals.length} in progress
          </Text>
        )}
      </View>

      {displayedGoals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No goals yet</Text>
          <Pressable onPress={() => router.push("/(modals)/create-goal")}>
            <Text style={styles.createLink}>Create your first goal</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {displayedGoals.map((goal) => {
            const nextAction = getNextStatusAction(goal.status);
            const dots = getStatusDots(goal.status);
            const priorityKey = goal.priority as string | undefined;
            const impactKey = goal.impact as string | undefined;

            return (
              <SwipeableRow
                key={goal.id}
                leftAction={
                  nextAction
                    ? {
                        label: nextAction.label,
                        color: nextAction.color,
                        onAction: () => handleStatusChange(goal, nextAction.nextStatus),
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
                  style={goal.id === celebrationGoalId ? styles.goalCardCelebration : undefined}
                >
                  {/* Title */}
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    {goal.title}
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

                    {(goal as any).project?.name && (
                      <Text style={styles.projectName}>
                        {(goal as any).project.name}
                      </Text>
                    )}
                  </View>

                  {/* Status dots */}
                  <View style={styles.dotsRow}>
                    {dots.map((dot, i) => {
                      const statuses = ["pending", "in_progress", "completed"];
                      const targetStatus = statuses[i]!;
                      return (
                        <Pressable
                          key={targetStatus}
                          onPress={() => handleStatusChange(goal, targetStatus)}
                          hitSlop={8}
                        >
                          <View
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor: dot.filled
                                  ? dot.color
                                  : colors.border.default,
                              },
                            ]}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                  {goal.id === celebrationGoalId && <ConfettiBurst particleCount={20} />}
                  {goal.id === celebrationGoalId && xpDelta > 0 && (
                    <XPFloat amount={xpDelta} onComplete={() => setXpDelta(0)} />
                  )}
                </PressableCard>
              </SwipeableRow>
            );
          })}
        </>
      )}

      {/* Show all link — always visible */}
      <Pressable
        style={styles.showAllRow}
        onPress={() => router.push("/(main)/goals")}
      >
        <Text style={styles.showAllText}>Show all goals</Text>
        <ChevronRight size={16} color={colors.accent.indigo} />
      </Pressable>
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
  goalTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  goalCardCelebration: {
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
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
