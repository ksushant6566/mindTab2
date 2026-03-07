import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import { useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { goalQueryOptions, useUpdateGoal, useDeleteGoal } from "@mindtab/core";
import * as Haptics from "expo-haptics";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Chip } from "~/components/ui/chip";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { XPFloat } from "~/components/ui/xp-float";
import { ChevronLeft, Trash2, Edit3, Folder, Calendar } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

// ── Status config ──

const statusOptions = ["pending", "in_progress", "completed"] as const;

const statusConfig: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: colors.status.pending },
  in_progress: { label: "In Progress", color: colors.status.active },
  completed: { label: "Completed", color: colors.status.completed },
};

// ── Priority config ──

const priorities = [
  { value: "priority_1", label: "P1", color: colors.priority.p1 },
  { value: "priority_2", label: "P2", color: colors.priority.p2 },
  { value: "priority_3", label: "P3", color: colors.priority.p3 },
  { value: "priority_4", label: "P4", color: colors.priority.p4 },
] as const;

// ── Impact config ──

const impactOptions = [
  { value: "low", label: "Low", color: colors.impact.low },
  { value: "medium", label: "Medium", color: colors.impact.medium },
  { value: "high", label: "High", color: colors.impact.high },
] as const;

// ── Screen ──

export default function GoalDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();

  const goBack = () => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/goals");
    }
  };

  const { data: goal, isLoading } = useQuery(goalQueryOptions(api, id));
  const updateGoal = useUpdateGoal(api);
  const deleteGoal = useDeleteGoal(api);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editImpact, setEditImpact] = useState("");

  // Delete confirmation inline
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // XP hint on completion
  const [xpHint, setXpHint] = useState<number | null>(null);

  if (isLoading || !goal) return <Loading />;

  const g = goal as any;

  const createdDate = g.createdAt
    ? new Date(g.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // ── Edit mode helpers ──

  const startEditing = () => {
    setEditTitle(g.title || "");
    setEditDescription(g.description || "");
    setEditPriority(g.priority || "priority_2");
    setEditImpact(g.impact || "medium");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    updateGoal.mutate(
      {
        id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        impact: editImpact,
      },
      {
        onSuccess: () => {
          toast.success("Goal updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update goal"),
      },
    );
  };

  // ── Status change ──

  const handleStatusChange = async (status: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const wasCompleted = g.status === "completed";
    updateGoal.mutate({
      id,
      status,
      completedAt: status === "completed" ? new Date().toISOString() : null,
    });
    // Show XP hint when completing
    if (status === "completed" && !wasCompleted) {
      setXpHint(25);
    }
  };

  // ── Delete ──

  const handleDelete = () => {
    deleteGoal.mutate(id, { onSuccess: () => goBack() });
  };

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.headerBtn}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={isEditing ? handleSave : startEditing}
          hitSlop={8}
          style={styles.headerBtn}
        >
          {isEditing ? (
            <Text style={styles.saveText}>Save</Text>
          ) : (
            <Edit3 size={20} color={colors.text.primary} />
          )}
        </Pressable>
        <Pressable
          onPress={() => setShowDeleteConfirm(true)}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Trash2 size={20} color={colors.feedback.error} />
        </Pressable>
      </View>

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <View style={styles.deleteBar}>
          <Text style={styles.deleteText}>Delete this goal?</Text>
          <View style={styles.deleteActions}>
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={styles.deleteCancelBtn}
            >
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.deleteConfirmBtn}>
              <Text style={styles.deleteConfirmText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Title ── */}
        {isEditing ? (
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            style={styles.titleInput}
            placeholder="Goal title"
            placeholderTextColor={colors.text.muted}
            autoFocus
          />
        ) : (
          <Text style={styles.title}>{g.title}</Text>
        )}

        {/* ── Status row ── */}
        <View style={styles.statusRow}>
          {statusOptions.map((s) => {
            const cfg = statusConfig[s]!;
            const selected = g.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => handleStatusChange(s)}
                style={[
                  styles.statusBtn,
                  selected
                    ? { backgroundColor: cfg.color }
                    : { borderWidth: 1, borderColor: colors.border.default },
                ]}
              >
                <Text
                  style={[
                    styles.statusBtnText,
                    { color: selected ? "#fff" : colors.text.muted },
                  ]}
                >
                  {cfg.label}
                </Text>
              </Pressable>
            );
          })}
          {/* XP hint */}
          {xpHint !== null && (
            <View style={styles.xpHintContainer}>
              <XPFloat amount={xpHint} onComplete={() => setXpHint(null)} />
            </View>
          )}
        </View>

        {/* ── Description ── */}
        {isEditing ? (
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            style={styles.descriptionInput}
            placeholder="Add a description..."
            placeholderTextColor={colors.text.muted}
            multiline
            textAlignVertical="top"
          />
        ) : g.description ? (
          <Text style={styles.description}>{g.description}</Text>
        ) : null}

        {/* ── Priority row ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>PRIORITY</Text>
          <View style={styles.chipRow}>
            {priorities.map((p) => (
              <Chip
                key={p.value}
                label={p.label}
                selected={(isEditing ? editPriority : g.priority) === p.value}
                color={p.color}
                size="sm"
                onPress={
                  isEditing ? () => setEditPriority(p.value) : undefined
                }
              />
            ))}
          </View>
        </View>

        {/* ── Impact row ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>IMPACT</Text>
          <View style={styles.chipRow}>
            {impactOptions.map((i) => (
              <Chip
                key={i.value}
                label={i.label}
                selected={(isEditing ? editImpact : g.impact) === i.value}
                color={i.color}
                size="sm"
                onPress={
                  isEditing ? () => setEditImpact(i.value) : undefined
                }
              />
            ))}
          </View>
        </View>

        {/* ── Project badge ── */}
        {g.project && (
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>PROJECT</Text>
            <View style={styles.projectBadge}>
              <Folder size={14} color={colors.accent.indigo} />
              <Text style={styles.projectText}>
                {g.project.title ?? g.project.name ?? "Project"}
              </Text>
            </View>
          </View>
        )}

        {/* ── Created date ── */}
        {createdDate && (
          <View style={styles.sectionRow}>
            <View style={styles.dateRow}>
              <Calendar size={14} color={colors.text.muted} />
              <Text style={styles.dateText}>Created {createdDate}</Text>
            </View>
          </View>
        )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerBtn: {
    padding: 4,
    marginLeft: 12,
  },
  headerSpacer: {
    flex: 1,
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accent.indigo,
  },

  // Delete confirmation
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
    paddingBottom: 40,
  },

  // Title
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 16,
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

  // Status
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
    position: "relative",
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  xpHintContainer: {
    position: "absolute",
    right: 0,
    top: -10,
  },

  // Description
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    lineHeight: 24,
    marginBottom: 20,
  },
  descriptionInput: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 24,
    marginBottom: 20,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border.focus,
    borderRadius: 8,
    padding: 12,
  },

  // Sections
  sectionRow: {
    marginBottom: 16,
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

  // Project
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent.indigoMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  projectText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.accent.indigo,
  },

  // Date
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    color: colors.text.muted,
  },
});
