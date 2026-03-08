import React, { useState, useCallback } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { habitTrackerQueryOptions } from "@mindtab/core";

import { colors } from "~/styles/colors";
import { getXPProgress } from "~/lib/xp";
import { calculateStreak } from "~/lib/streak";
import { ProgressBar } from "~/components/ui/progress-bar";
import { StreakFlame } from "~/components/ui/streak-flame";
import { useAuth } from "~/hooks/use-auth";
import { api } from "~/lib/api-client";

function getAvatarBorderColor(streak: number): string {
  if (streak >= 100) return colors.streak.purple;
  if (streak >= 30) return colors.streak.purple;
  if (streak >= 7) return colors.streak.gold;
  if (streak >= 1) return colors.streak.orange;
  return colors.border.default;
}

function interpolateColor(progress: number): string {
  const r = Math.round(129 + (250 - 129) * progress);
  const g = Math.round(140 + (204 - 140) * progress);
  const b = Math.round(248 + (21 - 248) * progress);
  return `rgb(${r}, ${g}, ${b})`;
}

type DashboardHeaderProps = {
  xpBarGlowing?: boolean;
};

export function DashboardHeader({ xpBarGlowing = false }: DashboardHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [showXpTooltip, setShowXpTooltip] = useState(false);

  const toggleXpTooltip = useCallback(() => {
    setShowXpTooltip((v) => !v);
    if (!showXpTooltip) {
      setTimeout(() => setShowXpTooltip(false), 3000);
    }
  }, [showXpTooltip]);

  const { data: tracker } = useQuery(habitTrackerQueryOptions(api));

  const streak = tracker ? calculateStreak(tracker) : 0;
  const xp = user?.xp ?? 0;
  const { level, progress, xpToNext, nextLevelXP } = getXPProgress(xp);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const avatarBorderColor = getAvatarBorderColor(streak);
  const xpBarColor = interpolateColor(progress);
  const initial = (user?.name?.[0] ?? "").toUpperCase();

  return (
    <View style={styles.container}>
      {/* Row 1: Date (left), Search + Avatar (right) */}
      <View style={styles.topRow}>
        <Text style={styles.date}>{dateStr}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push("/(modals)/command-palette")}
            style={styles.searchButton}
          >
            <Search size={20} color={colors.text.secondary} />
          </Pressable>
          <Pressable onPress={() => router.push("/(modals)/profile")}>
            {user?.image ? (
              <Image
                source={{ uri: user.image }}
                style={[
                  styles.avatar,
                  { borderColor: avatarBorderColor, shadowColor: avatarBorderColor },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { borderColor: avatarBorderColor, shadowColor: avatarBorderColor },
                ]}
              >
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Row 2: XP bar + level + streak */}
      <Pressable style={styles.xpRow} onPress={toggleXpTooltip}>
        <View style={styles.xpBarSection}>
          <ProgressBar value={progress} color={xpBarColor} height={3} glowing={xpBarGlowing} />
          <View style={styles.xpMeta}>
            <Text style={styles.xpLabel}>Lv.{level}</Text>
            <Text style={styles.xpValue}>{xp} XP</Text>
          </View>
        </View>
        <StreakFlame count={streak} size={24} showCount />
        {showXpTooltip && (
          <View style={styles.xpTooltip}>
            <Text style={styles.xpTooltipText}>{xp} / {nextLevelXP} XP</Text>
            <Text style={styles.xpTooltipText}>{xpToNext} to next level</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  date: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchButton: {
    padding: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  xpBarSection: {
    flex: 1,
    marginRight: 12,
  },
  xpMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  xpLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
  },
  xpValue: {
    fontSize: 11,
    color: colors.xp.gold,
  },
  xpTooltip: {
    position: "absolute",
    top: -24,
    left: 0,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 8,
  },
  xpTooltipText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: "500",
  },
});
