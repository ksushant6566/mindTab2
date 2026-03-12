import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  ChevronLeft,
  Edit3,
  MoreHorizontal,
  Trash2,
  Archive,
  Target,
  StickyNote,
  Zap,
} from "lucide-react-native";
import {
  projectQueryOptions,
  goalsQueryOptions,
  journalsQueryOptions,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
  useUpdateGoal,
} from "@mindtab/core";

import { Loading } from "~/components/ui/loading";
import { Chip } from "~/components/ui/chip";
import { PressableCard } from "~/components/ui/pressable-card";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { ProgressBar } from "~/components/ui/progress-bar";
import { EmptyState } from "~/components/ui/empty-state";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

// ── Constants ──

const EDIT_STATUSES = ["active", "paused", "completed", "archived"] as const;

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: colors.status.active },
  paused: { label: "Paused", color: colors.status.paused },
  on_hold: { label: "Paused", color: colors.status.paused },
  completed: { label: "Completed", color: colors.status.completed },
  archived: { label: "Archived", color: colors.status.archived },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  priority_1: { label: "P1", color: colors.priority.p1 },
  priority_2: { label: "P2", color: colors.priority.p2 },
  priority_3: { label: "P3", color: colors.priority.p3 },
  priority_4: { label: "P4", color: colors.priority.p4 },
};

const impactConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: colors.impact.low },
  medium: { label: "Medium", color: colors.impact.medium },
  high: { label: "High", color: colors.impact.high },
};

const noteTypeConfig: Record<string, { label: string; color: string }> = {
  article: { label: "Article", color: colors.noteType.article },
  book: { label: "Book", color: colors.noteType.book },
  video: { label: "Video", color: colors.noteType.video },
  podcast: { label: "Podcast", color: colors.noteType.podcast },
  website: { label: "Website", color: colors.noteType.website },
};

// ── Helpers ──

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getNextStatusAction(status: string) {
  if (status === "pending")
    return {
      label: "Start",
      color: colors.status.active,
      nextStatus: "in_progress",
    };
  if (status === "in_progress")
    return {
      label: "Done",
      color: colors.status.completed,
      nextStatus: "completed",
    };
  return null;
}

// ── Screen ──

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Data fetching
  const {
    data: project,
    isLoading,
    refetch: refetchProject,
  } = useQuery(projectQueryOptions(api, id));
  const { data: goals = [], refetch: refetchGoals } = useQuery(
    goalsQueryOptions(api, { projectId: id }),
  );
  const { data: notes = [], refetch: refetchNotes } = useQuery(
    journalsQueryOptions(api, { projectId: id }),
  );

  // Mutations
  const updateProject = useUpdateProject(api);
  const deleteProject = useDeleteProject(api);
  const archiveProject = useArchiveProject(api);
  const updateGoal = useUpdateGoal(api);

  // UI state
  const [activeTab, setActiveTab] = useState<"goals" | "notes">("goals");
  const [refreshing, setRefreshing] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<string>("active");

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Navigation ──

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/projects");
    }
  };

  // ── Refresh ──

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProject(), refetchGoals(), refetchNotes()]);
    setRefreshing(false);
  }, [refetchProject, refetchGoals, refetchNotes]);

  // ── Computed stats ──

  const goalCount = (goals as any[]).length;
  const noteCount = (notes as any[]).length;
  const completedGoals = useMemo(
    () => (goals as any[]).filter((g) => g.status === "completed").length,
    [goals],
  );
  const progressValue = goalCount > 0 ? completedGoals / goalCount : 0;

  // ── Edit handlers ──

  const startEditing = () => {
    const p = project as any;
    setEditName(p.name || "");
    setEditDescription(p.description || "");
    setEditStatus(p.status || "active");
    setIsEditing(true);
    setShowOverflow(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }
    updateProject.mutate(
      {
        id,
        name: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      },
      {
        onSuccess: () => {
          toast.success("Project updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update project"),
      },
    );
  };

  const handleStatusChipPress = async (status: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditStatus(status);
  };

  // ── Delete ──

  const handleDeletePress = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowDeleteConfirm(true);
    setShowOverflow(false);
  };

  const handleDeleteConfirm = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    deleteProject.mutate(id, { onSuccess: () => goBack() });
  };

  // ── Archive ──

  const handleArchive = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowOverflow(false);
    archiveProject.mutate(id, {
      onSuccess: () => {
        toast.success("Project archived");
        goBack();
      },
    });
  };

  // ── Goal actions ──

  const handleGoalStatusChange = useCallback(
    async (goalId: string, newStatus: string) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  const handleGoalArchive = useCallback(
    async (goalId: string) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateGoal.mutate({ id: goalId, status: "archived" });
    },
    [updateGoal],
  );

  // ── Loading ──

  if (isLoading || !project) return <Loading />;

  const p = project as any;
  const status = statusConfig[p.status as string];
  const dotColor = status?.color ?? colors.text.muted;

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {isEditing ? "Edit Project" : p.name}
        </Text>

        <Pressable
          onPress={isEditing ? handleSave : startEditing}
          hitSlop={8}
          style={styles.headerBtn}
        >
          {isEditing ? (
            <Text style={styles.saveText}>
              {updateProject.isPending ? "Saving..." : "Save"}
            </Text>
          ) : (
            <Edit3 size={20} color={colors.text.primary} />
          )}
        </Pressable>

        {isEditing ? (
          <Pressable onPress={cancelEditing} hitSlop={8} style={styles.headerBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setShowOverflow(!showOverflow)}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <MoreHorizontal size={20} color={colors.text.primary} />
          </Pressable>
        )}
      </View>

      {/* ── Overflow menu ── */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View style={[styles.overflowMenu, { top: insets.top + 48 }]}>
            <Pressable style={styles.overflowItem} onPress={handleArchive}>
              <Archive size={16} color={colors.status.paused} />
              <Text style={styles.overflowItemText}>Archive Project</Text>
            </Pressable>
            <View style={styles.overflowDivider} />
            <Pressable style={styles.overflowItem} onPress={handleDeletePress}>
              <Trash2 size={16} color={colors.feedback.error} />
              <Text style={styles.overflowItemTextDestructive}>
                Delete Project
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* ── Delete confirmation bar ── */}
      {showDeleteConfirm && (
        <View style={styles.deleteBar}>
          <Text style={styles.deleteText}>
            Delete this project and affect {goalCount} goals and {noteCount} notes?
          </Text>
          <View style={styles.deleteActions}>
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={styles.deleteCancelBtn}
            >
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteConfirm}
              style={styles.deleteConfirmBtn}
            >
              <Text style={styles.deleteConfirmText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.indigo}
          />
        }
      >
        {/* ── Project name ── */}
        {isEditing ? (
          <TextInput
            value={editName}
            onChangeText={setEditName}
            style={styles.titleInput}
            placeholder="Project name"
            placeholderTextColor={colors.text.muted}
            autoFocus
          />
        ) : (
          <Text style={styles.title}>{p.name}</Text>
        )}

        {/* ── Status badge / editor ── */}
        {isEditing ? (
          <View style={styles.statusEditSection}>
            <Text style={styles.sectionLabel}>STATUS</Text>
            <View style={styles.chipRow}>
              {EDIT_STATUSES.map((s) => {
                const cfg = statusConfig[s];
                return (
                  <Chip
                    key={s}
                    label={cfg?.label ?? s}
                    selected={editStatus === s}
                    color={cfg?.color ?? colors.text.muted}
                    size="sm"
                    onPress={() => handleStatusChipPress(s)}
                  />
                );
              })}
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: dotColor + "1A",
                borderColor: dotColor + "40",
              },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: dotColor }]}
            />
            <Text style={[styles.statusBadgeText, { color: dotColor }]}>
              {status?.label ?? (p.status as string)}
            </Text>
          </View>
        )}

        {/* ── Description ── */}
        {isEditing ? (
          <View style={styles.descriptionEditSection}>
            <Text style={styles.sectionLabel}>DESCRIPTION</Text>
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              style={styles.descriptionInput}
              placeholder="Add a description..."
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
            />
          </View>
        ) : p.description ? (
          <Text style={styles.description}>{p.description}</Text>
        ) : null}

        {/* ── Stats row ── */}
        {!isEditing && (
          <View style={styles.statsRow}>
            <Pressable style={styles.statCard} onPress={() => setActiveTab("goals")}>
              <Target size={18} color={colors.accent.indigo} />
              <Text style={styles.statNumber}>{goalCount}</Text>
              <Text style={styles.statLabel}>
                {goalCount === 1 ? "Goal" : "Goals"}
              </Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab("notes")}>
              <StickyNote size={18} color={colors.accent.indigo} />
              <Text style={styles.statNumber}>{noteCount}</Text>
              <Text style={styles.statLabel}>
                {noteCount === 1 ? "Note" : "Notes"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Progress bar ── */}
        {!isEditing && goalCount > 0 && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Completion</Text>
              <Text style={styles.progressPercentage}>
                {completedGoals}/{goalCount} ({Math.round(progressValue * 100)}
                %)
              </Text>
            </View>
            <ProgressBar
              value={progressValue}
              color={colors.status.completed}
              height={4}
            />
          </View>
        )}

        {/* ── Segmented control + tab content ── */}
        {!isEditing && (
          <>
            <View style={styles.segmentedControl}>
              <Pressable
                style={[
                  styles.segmentButton,
                  activeTab === "goals" && styles.segmentButtonActive,
                ]}
                onPress={() => setActiveTab("goals")}
              >
                <Target
                  size={14}
                  color={
                    activeTab === "goals"
                      ? colors.text.primary
                      : colors.text.muted
                  }
                />
                <Text
                  style={[
                    styles.segmentText,
                    activeTab === "goals" && styles.segmentTextActive,
                  ]}
                >
                  Goals
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.segmentButton,
                  activeTab === "notes" && styles.segmentButtonActive,
                ]}
                onPress={() => setActiveTab("notes")}
              >
                <StickyNote
                  size={14}
                  color={
                    activeTab === "notes"
                      ? colors.text.primary
                      : colors.text.muted
                  }
                />
                <Text
                  style={[
                    styles.segmentText,
                    activeTab === "notes" && styles.segmentTextActive,
                  ]}
                >
                  Notes
                </Text>
              </Pressable>
            </View>

            {activeTab === "goals" ? (
              <GoalsTab
                goals={goals as any[]}
                onStatusChange={handleGoalStatusChange}
                onArchive={handleGoalArchive}
                router={router}
              />
            ) : (
              <NotesTab notes={notes as any[]} router={router} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Goals Tab ──

function GoalsTab({
  goals,
  onStatusChange,
  onArchive,
  router,
}: {
  goals: any[];
  onStatusChange: (id: string, status: string) => void;
  onArchive: (id: string) => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Goals linked to this project will appear here"
      />
    );
  }

  return (
    <View style={styles.tabContent}>
      {goals.map((goal) => {
        const nextAction = getNextStatusAction(goal.status);
        const priorityKey = goal.priority as string | undefined;
        const impactKey = goal.impact as string | undefined;
        const goalStatus = statusConfig[goal.status as string];
        const goalDotColor = goalStatus?.color ?? colors.text.muted;

        return (
          <SwipeableRow
            key={goal.id}
            leftAction={
              nextAction
                ? {
                    label: nextAction.label,
                    color: nextAction.color,
                    onAction: () =>
                      onStatusChange(goal.id, nextAction.nextStatus),
                  }
                : undefined
            }
            rightActions={[
              {
                label: "Archive",
                color: colors.feedback.warning,
                onAction: () => onArchive(goal.id),
              },
            ]}
          >
            <PressableCard
              onPress={() => router.push(`/(main)/goals/${goal.id}`)}
              style={styles.goalCard}
            >
              <View style={styles.goalTopRow}>
                <View
                  style={[
                    styles.goalStatusDot,
                    { backgroundColor: goalDotColor },
                  ]}
                />
                <Text style={styles.goalTitle} numberOfLines={1}>
                  {goal.title}
                </Text>
              </View>
              <View style={styles.goalMeta}>
                {priorityKey && priorityConfig[priorityKey] && (
                  <View
                    style={[
                      styles.metaPill,
                      {
                        backgroundColor:
                          priorityConfig[priorityKey]!.color + "1A",
                        borderColor:
                          priorityConfig[priorityKey]!.color + "40",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metaPillText,
                        { color: priorityConfig[priorityKey]!.color },
                      ]}
                    >
                      {priorityConfig[priorityKey]!.label}
                    </Text>
                  </View>
                )}
                {impactKey && impactConfig[impactKey] && (
                  <View style={styles.impactRow}>
                    <Zap
                      size={12}
                      color={impactConfig[impactKey]!.color}
                    />
                    <Text
                      style={[
                        styles.impactText,
                        { color: impactConfig[impactKey]!.color },
                      ]}
                    >
                      {impactConfig[impactKey]!.label}
                    </Text>
                  </View>
                )}
              </View>
            </PressableCard>
          </SwipeableRow>
        );
      })}
    </View>
  );
}

// ── Notes Tab ──

function NotesTab({
  notes,
  router,
}: {
  notes: any[];
  router: ReturnType<typeof useRouter>;
}) {
  if (notes.length === 0) {
    return (
      <EmptyState
        icon={StickyNote}
        title="No notes yet"
        description="Notes linked to this project will appear here"
      />
    );
  }

  const sortedNotes = [...notes].sort((a, b) => {
    const aDate = a.updatedAt ?? a.createdAt ?? "";
    const bDate = b.updatedAt ?? b.createdAt ?? "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  return (
    <View style={styles.tabContent}>
      {sortedNotes.map((note) => {
        const preview = note.content ? stripHtml(note.content) : "";
        const dateStr = note.updatedAt ?? note.createdAt;
        const noteType = note.type as string | undefined;
        const typeInfo = noteType ? noteTypeConfig[noteType] : null;

        return (
          <SwipeableRow
            key={note.id}
            rightActions={[
              {
                label: "Edit",
                color: colors.status.active,
                onAction: () =>
                  router.push({ pathname: `/(main)/notes/[id]`, params: { id: note.id, editing: "true" } } as any),
              },
            ]}
          >
            <PressableCard
              onPress={() => router.push(`/(main)/notes/${note.id}`)}
              style={styles.noteCard}
            >
              <Text style={styles.noteTitle} numberOfLines={1}>
                {note.title || "Untitled"}
              </Text>
              {preview ? (
                <Text style={styles.notePreview} numberOfLines={2}>
                  {preview}
                </Text>
              ) : null}
              <View style={styles.noteMeta}>
                {typeInfo && (
                  <View
                    style={[
                      styles.metaPill,
                      {
                        backgroundColor: typeInfo.color + "1A",
                        borderColor: typeInfo.color + "40",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.metaPillText, { color: typeInfo.color }]}
                    >
                      {typeInfo.label}
                    </Text>
                  </View>
                )}
                {dateStr && (
                  <Text style={styles.noteDateText}>
                    {formatDate(dateStr)}
                  </Text>
                )}
              </View>
            </PressableCard>
          </SwipeableRow>
        );
      })}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    padding: 4,
  },
  headerBtn: {
    padding: 4,
    marginLeft: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 4,
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accent.indigo,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.secondary,
  },

  // Overflow menu
  overflowBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  overflowMenu: {
    position: "absolute",
    right: 16,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 4,
    minWidth: 180,
    zIndex: 21,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  overflowItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text.primary,
  },
  overflowItemTextDestructive: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.feedback.error,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.default,
    marginHorizontal: 16,
  },

  // Delete confirmation bar
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
  deleteText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.feedback.error,
  },
  deleteActions: {
    flexDirection: "row",
    gap: 12,
  },
  deleteCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  deleteCancelText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.secondary,
  },
  deleteConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.feedback.error,
  },
  deleteConfirmText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },

  // Content
  content: {
    padding: 16,
    paddingBottom: 100,
  },

  // Title
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 12,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.focus,
    paddingBottom: 8,
  },

  // Status badge (read mode)
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Status edit section
  statusEditSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: colors.text.muted,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  // Description
  description: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  descriptionEditSection: {
    marginBottom: 20,
  },
  descriptionInput: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border.focus,
    borderRadius: 8,
    padding: 12,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },

  // Progress
  progressSection: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  progressPercentage: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.status.completed,
  },

  // Segmented control
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.bg.surface,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segmentButtonActive: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  segmentTextActive: {
    color: colors.text.primary,
  },

  // Tab content
  tabContent: {
    minHeight: 100,
  },

  // Goal card
  goalCard: {
    padding: 14,
  },
  goalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.primary,
  },
  goalMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginLeft: 16,
  },

  // Shared meta pill
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Impact
  impactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  impactText: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Note card
  noteCard: {
    padding: 14,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  notePreview: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: 20,
  },
  noteMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  noteDateText: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
