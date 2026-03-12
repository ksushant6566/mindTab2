import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { FolderKanban } from "lucide-react-native";
import {
  projectsQueryOptions,
  projectsStatsQueryOptions,
  useArchiveProject,
  useDeleteProject,
} from "@mindtab/core";

import { Chip } from "~/components/ui/chip";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { ProgressBar } from "~/components/ui/progress-bar";
import { EmptyState } from "~/components/ui/empty-state";
import { ListHeader } from "~/components/list-header";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

// ---------- Constants ----------

type StatusFilter = "all" | "active" | "paused" | "completed" | "archived";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: colors.status.active },
  paused: { label: "Paused", color: colors.status.paused },
  on_hold: { label: "Paused", color: colors.status.paused },
  completed: { label: "Completed", color: colors.status.completed },
  archived: { label: "Archived", color: colors.status.archived },
};

function getProgressColor(completion: number): string {
  if (completion === 0) return colors.text.muted;
  if (completion < 0.5) return colors.accent.indigo;
  return colors.status.completed;
}

// ---------- Screen ----------

export default function ProjectsScreen() {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: projects,
    isLoading,
    refetch: refetchProjects,
  } = useQuery(projectsQueryOptions(api, { includeArchived: true }));

  const { data: stats, refetch: refetchStats } = useQuery(
    projectsStatsQueryOptions(api),
  );

  const archiveProject = useArchiveProject(api);
  const deleteProject = useDeleteProject(api);

  // Build stats map: projectId -> { goalCount, noteCount, completedGoals }
  const statsMap = useMemo(() => {
    const map = new Map<
      string,
      { goalCount: number; noteCount: number; completedGoals: number }
    >();
    if (!stats) return map;
    for (const s of stats as any[]) {
      map.set(s.projectId, {
        goalCount: s.goalCount ?? 0,
        noteCount: s.noteCount ?? 0,
        completedGoals: s.completedGoals ?? 0,
      });
    }
    return map;
  }, [stats]);

  // Filter projects by status
  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    if (statusFilter === "all") return list;
    if (statusFilter === "paused") {
      return list.filter((p: any) => p.status === "paused" || p.status === "on_hold");
    }
    return list.filter((p: any) => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProjects(), refetchStats()]);
    setRefreshing(false);
  }, [refetchProjects, refetchStats]);

  // Swipe actions
  const handleArchive = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      archiveProject.mutate(id);
    },
    [archiveProject],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteProject.mutate(id);
    },
    [deleteProject],
  );

  // ---------- Renderers ----------

  const renderItem = useCallback(
    ({ item: project }: { item: any }) => {
      const st = statsMap.get(project.id);
      const goalCount = st?.goalCount ?? 0;
      const noteCount = st?.noteCount ?? 0;
      const completedGoals = st?.completedGoals ?? 0;
      const progressValue = goalCount > 0 ? completedGoals / goalCount : 0;

      const statusKey = project.status as string;
      const config = STATUS_CONFIG[statusKey] ?? {
        label: statusKey,
        color: colors.text.muted,
      };

      return (
        <SwipeableRow
          rightActions={[
            {
              label: "Edit",
              color: colors.status.active,
              onAction: () => router.push(`/(main)/projects/${project.id}` as any),
            },
          ]}
        >
          <PressableCard
            onPress={() => router.push(`/(main)/projects/${project.id}`)}
          >
            {/* Header: name + status badge */}
            <View style={styles.cardHeader}>
              <Text style={styles.projectName} numberOfLines={1}>
                {project.name}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: config.color + "1A" },
                ]}
              >
                <StatusDot status={statusKey} color={config.color} />
                <Text style={[styles.statusLabel, { color: config.color }]}>
                  {config.label}
                </Text>
              </View>
            </View>

            {/* Description preview */}
            {project.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {project.description}
              </Text>
            ) : null}

            {/* Metadata: goal count + note count */}
            <View style={styles.metaRow}>
              <View style={styles.countPill}>
                <Text style={styles.countValue}>{goalCount}</Text>
                <Text style={styles.countLabel}>
                  {goalCount === 1 ? "goal" : "goals"}
                </Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.countPill}>
                <Text style={styles.countValue}>{noteCount}</Text>
                <Text style={styles.countLabel}>
                  {noteCount === 1 ? "note" : "notes"}
                </Text>
              </View>
            </View>

            {/* Progress bar (only when there are goals) */}
            {goalCount > 0 && (
              <View style={styles.progressSection}>
                <View style={styles.progressBarWrapper}>
                  <ProgressBar
                    value={progressValue}
                    color={getProgressColor(progressValue)}
                    height={4}
                  />
                </View>
                <Text style={styles.progressPercent}>
                  {Math.round(progressValue * 100)}%
                </Text>
              </View>
            )}
          </PressableCard>
        </SwipeableRow>
      );
    },
    [statsMap, router, handleArchive, handleDelete],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Group your goals and notes into projects to stay organised"
      />
    );
  }, [isLoading]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  // ---------- Subtitle ----------

  const activeCount = useMemo(
    () => (projects ?? []).filter((p: any) => p.status === "active").length,
    [projects],
  );
  const projectSubtitle = activeCount > 0
    ? `${activeCount} active`
    : `${(projects ?? []).length} projects`;

  // ---------- Layout ----------

  return (
    <View style={styles.screen}>
      <ListHeader title="Projects" subtitle={projectSubtitle} />
      <FlatList
        data={filteredProjects}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
        showsVerticalScrollIndicator={false}
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

function StatusDot({ status, color }: { status: string; color: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (status === "active") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1,
        true,
      );
    }
  }, [status, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.statusDot, { backgroundColor: color }, animatedStyle]} />;
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Card header
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  projectName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Description
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    marginTop: 6,
  },

  // Metadata counts
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  countLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border.default,
  },

  // Progress
  progressSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  progressBarWrapper: {
    flex: 1,
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    minWidth: 30,
    textAlign: "right",
  },
});
