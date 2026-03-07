import React from "react";
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
  if (streak >= 30) return colors.streak.purple;
  if (streak >= 7) return colors.streak.gold;
  if (streak >= 1) return colors.streak.orange;
  return colors.border.default;
}

function interpolateColor(progress: number): string {
  // Interpolate from indigo to gold based on progress (0-1)
  // indigo approx (99, 102, 241) -> gold approx (234, 179, 8)
  const r = Math.round(99 + (234 - 99) * progress);
  const g = Math.round(102 + (179 - 102) * progress);
  const b = Math.round(241 + (8 - 241) * progress);
  return `rgb(${r}, ${g}, ${b})`;
}

export function DashboardHeader() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: tracker } = useQuery(habitTrackerQueryOptions(api));

  const streak = tracker ? calculateStreak(tracker) : 0;
  const xp = user?.xp ?? 0;
  const { level, progress, xpToNext } = getXPProgress(xp);

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
                  { borderColor: avatarBorderColor },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { borderColor: avatarBorderColor },
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
        <View style={styles.xpBarContainer}>
          <ProgressBar value={progress} color={xpBarColor} height={3} />
          <View style={styles.xpLabels}>
            <Text style={styles.xpAmount}>{xp} XP</Text>
            <Text style={styles.levelLabel}>Level {level}</Text>
          </View>
        </View>
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
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
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
  xpLabels: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  xpAmount: {
    fontSize: 12,
    color: colors.xp.gold,
  },
  levelLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
