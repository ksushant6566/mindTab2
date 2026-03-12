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

  const xpBarColor = interpolateColor(progress);
  const initial = (user?.name?.[0] ?? "").toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Avatar */}
        <Pressable onPress={() => router.push("/(modals)/profile")}>
          {user?.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}
        </Pressable>

        {/* XP section: label on top, bar below */}
        <Pressable style={styles.xpSection} onPress={toggleXpTooltip}>
          <View style={styles.xpLabelRow}>
            <Text style={styles.levelText}>Lv.{level}</Text>
            <Text style={styles.xpDot}>·</Text>
            <Text style={styles.xpLabel}>{xp} XP</Text>
          </View>
          <ProgressBar
            value={progress}
            color={xpBarColor}
            height={4}
            glowing={xpBarGlowing}
          />
        </Pressable>

        {/* Streak flame with overlaid count */}
        <StreakFlame count={streak} size={28} showCount overlay />

        {/* Search */}
        <Pressable
          onPress={() => router.push("/(modals)/command-palette")}
          style={styles.searchButton}
        >
          <Search size={18} color={colors.text.secondary} />
        </Pressable>
      </View>

      {/* XP tooltip */}
      {showXpTooltip && (
        <View style={styles.xpTooltip}>
          <Text style={styles.xpTooltipText}>
            {xp} / {nextLevelXP} XP
          </Text>
          <Text style={styles.xpTooltipText}>{xpToNext} to next level</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  xpSection: {
    flex: 1,
    gap: 4,
  },
  xpLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.muted,
  },
  xpDot: {
    fontSize: 12,
    color: colors.text.muted,
  },
  xpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.xp.gold,
  },
  searchButton: {
    padding: 6,
  },
  xpTooltip: {
    marginTop: 8,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
  },
  xpTooltipText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: "500",
  },
});
