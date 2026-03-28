import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  habitTrackerQueryOptions,
  habitsQueryOptions,
  goalsQueryOptions,
  journalsQueryOptions,
} from "@mindtab/core";
import { api } from "~/lib/api-client";
import { useAuth } from "~/hooks/use-auth";
import { calculateStreak } from "~/lib/streak";
import { getXPProgress } from "~/lib/xp";
import { ProgressBar } from "~/components/ui/progress-bar";
import { StreakFlame } from "~/components/ui/streak-flame";
import { StreakCalendar } from "~/components/profile/streak-calendar";
import { ActivityHeatmap } from "~/components/profile/activity-heatmap";
import { StatsCards } from "~/components/profile/stats-cards";
import { X, LogOut, Zap } from "lucide-react-native";
import { colors } from "~/styles/colors";
import Constants from "expo-constants";

// -- Streak tier ring color --

function getStreakRingColor(streak: number): string {
  if (streak >= 100) return colors.streak.purple; // rainbow animated separately
  if (streak >= 30) return colors.streak.purple;
  if (streak >= 7) return colors.streak.gold;
  if (streak >= 1) return colors.streak.orange;
  return colors.border.default;
}

// -- Screen --

export default function ProfileModal() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: tracker = [] } = useQuery(habitTrackerQueryOptions(api));
  const { data: habits = [] } = useQuery(habitsQueryOptions(api));
  const { data: goals = [] } = useQuery(goalsQueryOptions(api));
  const { data: notes = [] } = useQuery(journalsQueryOptions(api));

  const streak = calculateStreak(tracker as any[]);
  const xp = user?.xp ?? 0;
  const { level, currentLevelXP, nextLevelXP, progress, xpToNext } =
    getXPProgress(xp);
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      {/* Handle indicator */}
      <View style={styles.handleRow}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeButton}
        >
          <X size={22} color={colors.text.secondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <View
            style={[
              styles.avatarRing,
              { borderColor: getStreakRingColor(streak) },
            ]}
          >
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>

          {/* Compact XP display */}
          <View style={styles.xpCompact}>
            <Text style={styles.xpCompactLevel}>Lv.{level}</Text>
            <Text style={styles.xpCompactCount}>{xp} XP</Text>
            <View style={styles.xpCompactBarContainer}>
              <View
                style={[styles.xpCompactBarFill, { width: `${Math.round(progress * 100)}%` }]}
              />
            </View>
          </View>
        </View>

        {/* XP Level card */}
        <View style={styles.card}>
          <View style={styles.xpHeader}>
            <Zap size={20} color={colors.xp.gold} />
            <Text style={styles.xpLevelTitle}>Level {level}</Text>
          </View>
          <View style={styles.xpProgressRow}>
            <ProgressBar
              value={progress}
              color={colors.xp.gold}
              height={6}
            />
          </View>
          <Text style={styles.xpLabel}>
            {xp - currentLevelXP} / {nextLevelXP - currentLevelXP} XP
          </Text>
          <Text style={styles.xpSubtitle}>{xpToNext} XP to next level</Text>
        </View>

        {/* Streak stat card */}
        <View style={styles.card}>
          <View style={styles.streakRow}>
            <StreakFlame count={streak} size={28} showCount={false} />
            <Text style={styles.streakCount}>{streak}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Streak calendar (item 1) */}
        <StreakCalendar tracker={tracker as any[]} />

        {/* Activity heatmap (item 2) */}
        <ActivityHeatmap tracker={tracker as any[]} />

        {/* Stats cards (item 3) */}
        <StatsCards
          goals={goals as any[]}
          habits={habits as any[]}
          tracker={tracker as any[]}
          notesCount={(notes as any[]).length}
        />

        {/* Sign out button */}
        <Pressable onPress={handleSignOut} style={styles.signOutRow}>
          <LogOut size={20} color={colors.feedback.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* App version */}
        <Text style={styles.version}>MindTab v{appVersion}</Text>
      </ScrollView>
    </View>
  );
}

// -- Styles --

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // Handle
  handleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text.muted,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },

  // Avatar
  avatarSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 28,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarFallback: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text.primary,
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.text.muted,
  },

  // Compact XP display (below email in avatar section)
  xpCompact: {
    alignItems: "center",
    marginTop: 12,
    gap: 4,
    width: "100%",
    paddingHorizontal: 32,
  },
  xpCompactLevel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  xpCompactCount: {
    color: "#888888",
    fontSize: 12,
  },
  xpCompactBarContainer: {
    height: 4,
    backgroundColor: "#222222",
    borderRadius: 2,
    width: "100%",
  },
  xpCompactBarFill: {
    height: 4,
    backgroundColor: "#ffffff",
    borderRadius: 2,
  },

  // Card
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 16,
    marginBottom: 14,
  },

  // XP Level
  xpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  xpLevelTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  xpProgressRow: {
    marginBottom: 10,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 2,
  },
  xpSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
  },

  // Streak
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  streakCount: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text.primary,
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.secondary,
  },

  // Sign out
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    marginTop: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.feedback.error,
  },

  // Version
  version: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 24,
  },
});
