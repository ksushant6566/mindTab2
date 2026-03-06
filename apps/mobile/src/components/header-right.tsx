import { View, Text, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { Search, Flame } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { useAuth } from "~/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { habitTrackerQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";

function calculateStreak(tracker: any[]): number {
  if (!tracker || tracker.length === 0) return 0;

  // tracker is an array of habits with completions
  // A streak day = at least one habit completed that day
  const completedDates = new Set<string>();
  for (const habit of tracker) {
    if (habit.completions) {
      for (const c of habit.completions) {
        completedDates.add(c.date);
      }
    }
  }

  if (completedDates.size === 0) return 0;

  // Count consecutive days ending at today or yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkDate = new Date(today);

  // Check if today is completed, if not start from yesterday
  const todayStr = checkDate.toISOString().split("T")[0];
  if (!completedDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (completedDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function HeaderRight() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: tracker = [] } = useQuery(habitTrackerQueryOptions(api));
  const streak = calculateStreak(tracker as any[]);

  return (
    <View className="flex-row items-center mr-4 gap-3">
      {/* XP */}
      <View className="flex-row items-center">
        <View className="w-2 h-2 rounded-full bg-amber-400 mr-1" />
        <Text className="text-xs text-foreground font-medium">{user?.xp ?? 0}</Text>
      </View>

      {/* Streak */}
      {streak > 0 && (
        <View className="flex-row items-center">
          <Flame size={14} color="#f97316" />
          <Text className="text-xs text-foreground font-medium ml-0.5">{streak}</Text>
        </View>
      )}

      {/* Search */}
      <Pressable onPress={() => router.push("/(modals)/command-palette")} className="p-1">
        <Search size={20} color={colors.foreground} />
      </Pressable>

      {/* Avatar */}
      {user?.image ? (
        <Pressable onPress={() => router.push("/(modals)/profile" as any)}>
          <Image
            source={{ uri: user.image }}
            className="w-7 h-7 rounded-full"
          />
        </Pressable>
      ) : null}
    </View>
  );
}
