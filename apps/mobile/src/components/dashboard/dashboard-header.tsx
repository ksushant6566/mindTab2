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
  if (streak >= 100) return colors.streak.purple; // animated rainbow handled by component
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

export function DashboardHeader() {
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

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] ?? "";

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
      {/* Row 1: Greeting (left), Search + Avatar (right) */}
      <View style={styles.greetingRow}>
        <Text style={styles.greeting}>
          {greeting}, {firstName}
        </Text>
        <View style={styles.greetingActions}>
          <Pressable
            onPress={() => router.push("/(modals)/command-palette")}
            style={styles.searchButton}
          >
            <Search size={22} color={colors.text.secondary} />
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

      {/* Row 2: Date string */}
      <Text style={styles.date}>{dateStr}</Text>

      {/* Row 3: XP progress bar with level/xp labels and streak flame */}
      <View style={styles.xpRow}>
        <Pressable style={styles.xpBarContainer} onPress={toggleXpTooltip}>
          <ProgressBar value={progress} color={xpBarColor} height={3} />
          <Text style={styles.xpLabel}>Level {level} - {xp} XP</Text>
          {showXpTooltip && (
            <View style={styles.xpTooltip}>
              <Text style={styles.xpTooltipText}>Level {level}</Text>
              <Text style={styles.xpTooltipText}>{xp} / {nextLevelXP} XP</Text>
              <Text style={styles.xpTooltipText}>{xpToNext} XP to Level {level + 1}</Text>
              <Text style={styles.xpTooltipText}>{Math.round(progress * 100)}%</Text>
            </View>
          )}
        </Pressable>
        <StreakFlame count={streak} size={28} showCount />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text.primary,
  },
  greetingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchButton: {
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  date: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  xpBarContainer: {
    flex: 1,
    marginRight: 12,
  },
  xpLabel: {
    fontSize: 12,
    color: colors.xp.gold,
    marginTop: 4,
  },
  xpTooltip: {
    position: "absolute",
    top: -28,
    left: 0,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  xpTooltipText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "500",
  },
});
