import { forwardRef, useCallback, Fragment } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Target,
  Repeat,
  FileText,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { colors } from "~/styles/colors";
import { getAccessToken, refreshTokens } from "~/lib/auth";

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

type ConnectedNote = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string | null;
  createdAt: string | null;
};

type ConnectedHabit = {
  id: string;
  title: string;
  frequency: string;
  createdAt: string | null;
};

type ConnectedItem =
  | (ConnectedNote & { kind: "note" })
  | (ConnectedHabit & { kind: "habit" });

// ---------------------------------------------------------------------------
// Connected Knowledge API
// ---------------------------------------------------------------------------

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

async function authedFetch(url: string): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-Platform": "mobile" },
  });
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed) return res;
    const newToken = await getAccessToken();
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${newToken}`,
        "X-Platform": "mobile",
      },
    });
  }
  return res;
}

async function fetchConnectedNotes(
  entityType: string,
  entityId: string,
): Promise<ConnectedNote[]> {
  const params = new URLSearchParams({ entityType, entityId });
  const res = await authedFetch(
    `${API_URL}/mentions/connected-notes?${params}`,
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchConnectedHabits(
  goalId: string,
): Promise<ConnectedHabit[]> {
  const res = await authedFetch(
    `${API_URL}/goals/${goalId}/connected-habits`,
  );
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeIcon(type: "goal" | "habit" | "note") {
  switch (type) {
    case "goal":
      return <Target size={20} color={colors.accent.indigo} />;
    case "habit":
      return <Repeat size={20} color={colors.feedback.success} />;
    case "note":
      return <FileText size={20} color={colors.status.active} />;
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

function timeAgo(iso: string | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

const statusDisplay: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: colors.status.pending },
  in_progress: { label: "In Progress", color: colors.status.active },
  active: { label: "Active", color: colors.status.active },
  completed: { label: "Completed", color: colors.status.completed },
  archived: { label: "Archived", color: colors.status.archived },
  paused: { label: "Paused", color: colors.status.paused },
};

const impactDisplay: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: colors.impact.low },
  medium: { label: "Medium", color: colors.impact.medium },
  high: { label: "High", color: colors.impact.high },
};

function pillTint(color: string) {
  return {
    backgroundColor: color + "18",
    borderColor: color + "35",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MentionPeekSheet = forwardRef<BottomSheet, MentionPeekSheetProps>(
  ({ entity, onDismiss, onNavigate }, ref) => {
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

    // --- Connected knowledge queries (hooks called unconditionally) ---
    const { data: connectedNotes, isLoading: notesLoading } = useQuery({
      queryKey: ["connected-notes", entity?.type, entity?.id],
      queryFn: () => fetchConnectedNotes(entity!.type, entity!.id),
      enabled: !!entity && entity.type !== "note",
      staleTime: 60_000,
    });

    const { data: connectedHabits } = useQuery({
      queryKey: ["connected-habits", entity?.id],
      queryFn: () => fetchConnectedHabits(entity!.id),
      enabled: !!entity && entity.type === "goal",
      staleTime: 60_000,
    });

    // --- Derived display data ---
    const status = entity?.status ? statusDisplay[entity.status] : null;
    const impact = entity?.impact ? impactDisplay[entity.impact] : null;
    const time = timeAgo(entity?.createdAt);

    const metaParts: string[] = [];
    if (entity?.projectName) metaParts.push(entity.projectName);
    if (time) metaParts.push(time);
    const metaLine = metaParts.join("  ·  ");

    const allConnected: ConnectedItem[] = [
      ...(connectedNotes ?? []).map(
        (n) => ({ ...n, kind: "note" as const }),
      ),
      ...(connectedHabits ?? []).map(
        (h) => ({ ...h, kind: "habit" as const }),
      ),
    ];
    const hasConnections = allConnected.length > 0;

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        enableDynamicSizing
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
        backdropComponent={renderBackdrop}
        onChange={(index) => {
          if (index >= 0)
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (index === -1) onDismiss();
        }}
      >
        <BottomSheetView style={styles.content}>
          {entity && (
            <>
              {/* ── Hero ── */}
              <View style={styles.hero}>
                <View style={styles.heroRow}>
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: typeColor(entity.type) + "14" },
                    ]}
                  >
                    {typeIcon(entity.type)}
                  </View>
                  <Text style={styles.title} numberOfLines={2}>
                    {entity.title}
                  </Text>
                </View>

                {/* Pills — type-specific */}
                <View style={styles.pills}>
                  {entity.type === "goal" && status && (
                    <View style={[styles.pill, pillTint(status.color)]}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: status.color },
                        ]}
                      />
                      <Text
                        style={[styles.pillLabel, { color: status.color }]}
                      >
                        {status.label}
                      </Text>
                    </View>
                  )}
                  {entity.type === "goal" && impact && (
                    <View style={[styles.pill, pillTint(impact.color)]}>
                      <Text
                        style={[styles.pillLabel, { color: impact.color }]}
                      >
                        {impact.label}
                      </Text>
                    </View>
                  )}
                  {entity.type === "habit" && (
                    <View style={[styles.pill, pillTint(colors.text.muted)]}>
                      <Text
                        style={[
                          styles.pillLabel,
                          { color: colors.text.secondary },
                        ]}
                      >
                        {capitalize(entity.frequency ?? "daily")}
                      </Text>
                    </View>
                  )}
                  {entity.type === "habit" && (entity.streak ?? 0) > 0 && (
                    <View
                      style={[styles.pill, pillTint(colors.streak.orange)]}
                    >
                      <Text
                        style={[
                          styles.pillLabel,
                          { color: colors.streak.orange },
                        ]}
                      >
                        🔥 {entity.streak}d
                      </Text>
                    </View>
                  )}
                </View>

                {/* Meta line */}
                {metaLine.length > 0 && (
                  <Text style={styles.meta}>{metaLine}</Text>
                )}
              </View>

              {/* ── Connected ── */}
              {(hasConnections || notesLoading) && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Connected</Text>
                    {notesLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.text.muted}
                        style={{ alignSelf: "flex-start", marginTop: 4 }}
                      />
                    ) : (
                      <View style={styles.listCard}>
                        {allConnected.map((item, i) => (
                          <Fragment key={item.id}>
                            {i > 0 && <View style={styles.listDivider} />}
                            <Pressable
                              onPress={() =>
                                onNavigate?.(item.kind, item.id)
                              }
                              style={({ pressed }) =>
                                pressed ? { opacity: 0.6 } : undefined
                              }
                            >
                              <View style={styles.listItem}>
                                {item.kind === "note" ? (
                                  <FileText
                                    size={15}
                                    color={colors.status.active}
                                  />
                                ) : (
                                  <Repeat
                                    size={15}
                                    color={colors.feedback.success}
                                  />
                                )}
                                <View style={styles.listItemText}>
                                  <Text
                                    style={styles.listItemTitle}
                                    numberOfLines={1}
                                  >
                                    {item.title}
                                  </Text>
                                  {item.kind === "note" && item.preview ? (
                                    <Text
                                      style={styles.listItemSub}
                                      numberOfLines={1}
                                    >
                                      {item.preview}
                                    </Text>
                                  ) : item.kind === "habit" ? (
                                    <Text style={styles.listItemSub}>
                                      {capitalize(item.frequency)}
                                    </Text>
                                  ) : null}
                                </View>
                                <ChevronRight
                                  size={14}
                                  color={colors.text.muted}
                                />
                              </View>
                            </Pressable>
                          </Fragment>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* ── CTA ── */}
              <Pressable
                onPress={handleNavigate}
                style={({ pressed }) =>
                  pressed ? { opacity: 0.7 } : undefined
                }
              >
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>
                    Open {capitalize(entity.type)}
                  </Text>
                  <ChevronRight size={16} color={colors.accent.indigo} />
                </View>
              </Pressable>
            </>
          )}
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
  handle: {
    backgroundColor: "#404040",
    width: 36,
    height: 4,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 44,
  },

  // Hero
  hero: {
    gap: 14,
    paddingTop: 8,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    lineHeight: 26,
    paddingTop: 2,
  },

  // Pills
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Meta
  meta: {
    fontSize: 13,
    color: colors.text.muted,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: 20,
  },

  // Connected section
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  listCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  listDivider: {
    height: 1,
    backgroundColor: colors.border.default,
    marginLeft: 42,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  listItemText: {
    flex: 1,
    gap: 2,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  listItemSub: {
    fontSize: 12,
    color: colors.text.muted,
  },

  // CTA
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: colors.accent.indigoMuted,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accent.indigo,
  },
});
