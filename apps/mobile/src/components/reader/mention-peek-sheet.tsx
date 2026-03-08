import { forwardRef, useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useUpdateGoal } from "@mindtab/core";
import {
  ChevronRight,
  Target,
  Repeat,
  FileText,
  Flame,
  ArrowUpRight,
  Calendar,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { colors } from "~/styles/colors";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Chip } from "~/components/ui/chip";
import { ConfettiBurst } from "~/components/ui/confetti-burst";
import { XPFloat } from "~/components/ui/xp-float";
import { XP_VALUES } from "~/lib/xp";
import { api } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MentionEntity = {
  type: "goal" | "habit" | "note";
  id: string;
  title: string;
  status?: string;
  priority?: string;
  impact?: string;
  projectName?: string;
  streak?: number;
  frequency?: string;
  createdAt?: string;
};

type MentionPeekSheetProps = {
  entity: MentionEntity | null;
  onDismiss: () => void;
  onNavigate?: (type: string, id: string) => void;
};

// ---------------------------------------------------------------------------
// Status / Priority helpers
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  pending: colors.status.pending,
  in_progress: colors.status.active,
  active: colors.status.active,
  completed: colors.status.completed,
  archived: colors.status.archived,
  paused: colors.status.paused,
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  p1: { label: "P1 Critical", color: colors.priority.p1 },
  p2: { label: "P2 High", color: colors.priority.p2 },
  p3: { label: "P3 Medium", color: colors.priority.p3 },
  p4: { label: "P4 Low", color: colors.priority.p4 },
};

const impactLabels: Record<string, { label: string; color: string }> = {
  low: { label: "Low Impact", color: colors.impact.low },
  medium: { label: "Medium Impact", color: colors.impact.medium },
  high: { label: "High Impact", color: colors.impact.high },
};

function capitalize(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeIcon(type: "goal" | "habit" | "note") {
  const size = 18;
  switch (type) {
    case "goal":
      return <Target size={size} color={colors.accent.indigo} />;
    case "habit":
      return <Repeat size={size} color={colors.feedback.success} />;
    case "note":
      return <FileText size={size} color={colors.status.active} />;
  }
}

function typeColor(type: "goal" | "habit" | "note"): string {
  switch (type) {
    case "goal":
      return colors.accent.indigo;
    case "habit":
      return colors.feedback.success;
    case "note":
      return colors.status.active;
  }
}

function createdAgoLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Created today";
  if (days === 1) return "Created 1 day ago";
  if (days < 30) return `Created ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Created 1 month ago";
  return `Created ${months} months ago`;
}

function getGoalXP(entity: MentionEntity): number {
  if (entity.priority === "p1") return XP_VALUES.GOAL_P1_COMPLETE;
  if (entity.impact === "high") return XP_VALUES.GOAL_HIGH_IMPACT_COMPLETE;
  return XP_VALUES.GOAL_COMPLETE;
}

// ---------------------------------------------------------------------------
// Sub-components for each entity type
// ---------------------------------------------------------------------------

function GoalDetails({ entity }: { entity: MentionEntity }) {
  const updateGoal = useUpdateGoal(api);
  const status = entity.status ?? "pending";
  const pri = entity.priority ? priorityLabels[entity.priority] : null;
  const imp = entity.impact ? impactLabels[entity.impact] : null;
  const progress =
    status === "completed" ? 1 : status === "in_progress" ? 0.5 : 0;
  const created = createdAgoLabel(entity.createdAt);

  const [showConfetti, setShowConfetti] = useState(false);
  const [xpDelta, setXpDelta] = useState<number | null>(null);

  return (
    <View style={styles.detailsContainer}>
      {/* XP burst overlay */}
      {showConfetti && (
        <ConfettiBurst
          particleCount={20}
          onComplete={() => setShowConfetti(false)}
        />
      )}
      {xpDelta !== null && (
        <XPFloat amount={xpDelta} onComplete={() => setXpDelta(null)} />
      )}

      {/* Status row */}
      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <View style={styles.statusChipRow}>
          {["pending", "in_progress", "completed"].map((goalStatus) => (
            <Chip
              key={goalStatus}
              label={goalStatus === "in_progress" ? "In Prog" : capitalize(goalStatus)}
              selected={status === goalStatus}
              color={statusColors[goalStatus] ?? colors.status.pending}
              size="sm"
              onPress={() => {
                updateGoal.mutate({ id: entity.id, status: goalStatus });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                // XP burst when completing
                if (goalStatus === "completed" && status !== "completed") {
                  setShowConfetti(true);
                  setXpDelta(getGoalXP(entity));
                }
              }}
            />
          ))}
        </View>
      </View>

      {/* Priority */}
      {pri && (
        <View style={styles.row}>
          <Text style={styles.label}>Priority</Text>
          <Text style={[styles.value, { color: pri.color }]}>
            {pri.label}
          </Text>
        </View>
      )}

      {/* Impact */}
      {imp && (
        <View style={styles.row}>
          <Text style={styles.label}>Impact</Text>
          <Text style={[styles.value, { color: imp.color }]}>
            {imp.label}
          </Text>
        </View>
      )}

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <ProgressBar value={progress} color={colors.accent.indigo} height={4} />
      </View>

      {/* Project */}
      {entity.projectName && (
        <View style={styles.row}>
          <Text style={styles.label}>Project</Text>
          <Text style={styles.value}>{entity.projectName}</Text>
        </View>
      )}

      {/* Created date */}
      {created && (
        <View style={styles.row}>
          <Text style={styles.label}>Created</Text>
          <View style={styles.createdRow}>
            <Calendar size={14} color={colors.text.muted} />
            <Text style={styles.value}>{created}</Text>
          </View>
        </View>
      )}

      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Connected Notes</Text>
        <Text style={styles.connectedText}>
          API support for mention-based note lookup is still required.
        </Text>
      </View>

      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Connected Habits</Text>
        <Text style={styles.connectedText}>
          Mention relationship queries will surface here once the API is available.
        </Text>
      </View>
    </View>
  );
}

function HabitDetails({ entity }: { entity: MentionEntity }) {
  const streak = entity.streak ?? 0;
  const frequency = entity.frequency ?? "daily";
  const created = createdAgoLabel(entity.createdAt);

  return (
    <View style={styles.detailsContainer}>
      {/* Frequency */}
      <View style={styles.row}>
        <Text style={styles.label}>Frequency</Text>
        <Text style={styles.value}>{capitalize(frequency)}</Text>
      </View>

      {/* Streak */}
      <View style={styles.row}>
        <Text style={styles.label}>Current Streak</Text>
        <View style={styles.streakRow}>
          <Flame size={16} color={colors.streak.orange} />
          <Text style={[styles.value, { color: colors.streak.orange }]}>
            {streak} {streak === 1 ? "day" : "days"}
          </Text>
        </View>
      </View>

      {/* Created date */}
      {created && (
        <View style={styles.row}>
          <Text style={styles.label}>Created</Text>
          <View style={styles.createdRow}>
            <Calendar size={14} color={colors.text.muted} />
            <Text style={styles.value}>{created}</Text>
          </View>
        </View>
      )}

      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Connected Notes</Text>
        <Text style={styles.connectedText}>
          API support for mention-based note lookup is still required.
        </Text>
      </View>

      <View style={styles.connectedSection}>
        <Text style={styles.connectedTitle}>Connected Habits</Text>
        <Text style={styles.connectedText}>
          Mention relationship queries will surface here once the API is available.
        </Text>
      </View>
    </View>
  );
}

function NoteDetails({ entity }: { entity: MentionEntity }) {
  return (
    <View style={styles.detailsContainer}>
      <Text style={styles.previewText}>
        Tap below to read the full note.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const MentionPeekSheet = forwardRef<BottomSheet, MentionPeekSheetProps>(
  ({ entity, onDismiss, onNavigate }, ref) => {
    const snapPoints = useMemo(() => ["50%"], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.4}
        />
      ),
      [],
    );

    const handleNavigate = useCallback(() => {
      if (!entity || !onNavigate) return;
      onDismiss();
      onNavigate(entity.type, entity.id);
    }, [entity, onDismiss, onNavigate]);

    if (!entity) return null;

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        backdropComponent={renderBackdrop}
        onChange={(index) => {
          if (index >= 0) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          if (index === -1) {
            onDismiss();
          }
        }}
      >
        <BottomSheetView style={styles.sheetContent}>
          {/* Header: icon + title */}
          <View style={styles.sheetHeader}>
            <View
              style={[
                styles.typeIconContainer,
                { backgroundColor: typeColor(entity.type) + "18" },
              ]}
            >
              {typeIcon(entity.type)}
            </View>
            <View style={styles.sheetTitleWrap}>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {entity.title}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {capitalize(entity.type)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.sheetDivider} />

          {/* Type-specific details */}
          {entity.type === "goal" && <GoalDetails entity={entity} />}
          {entity.type === "habit" && <HabitDetails entity={entity} />}
          {entity.type === "note" && <NoteDetails entity={entity} />}

          {/* Open full detail link */}
          <Pressable
            style={({ pressed }) => [
              styles.openFullBtn,
              pressed && styles.openFullBtnPressed,
            ]}
            onPress={handleNavigate}
          >
            <ArrowUpRight size={18} color={colors.accent.indigo} />
            <Text style={styles.openFullText}>Open Full Detail</Text>
            <View style={styles.headerSpacer} />
            <ChevronRight size={18} color={colors.text.muted} />
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

MentionPeekSheet.displayName = "MentionPeekSheet";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: "#404040",
    width: 36,
    height: 4,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Header
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 8,
  },
  typeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitleWrap: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    lineHeight: 26,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: 16,
  },
  // Details
  detailsContainer: {
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 14,
    color: colors.text.muted,
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  createdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressRow: {
    paddingVertical: 4,
  },
  statusChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  connectedSection: {
    paddingTop: 4,
    gap: 4,
  },
  connectedTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  connectedText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  previewText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  // Open full detail button
  openFullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  openFullBtnPressed: {
    opacity: 0.7,
  },
  openFullText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accent.indigo,
  },
  headerSpacer: {
    flex: 1,
  },
});
