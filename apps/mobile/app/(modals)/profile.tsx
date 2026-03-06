import { View, Text, Pressable, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { habitTrackerQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { useAuth } from "~/hooks/use-auth";
import { calculateStreak } from "~/lib/streak";
import { X, LogOut, Flame, Zap } from "lucide-react-native";
import { colors } from "~/styles/colors";
import Constants from "expo-constants";

export default function ProfileModal() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: tracker = [] } = useQuery(habitTrackerQueryOptions(api));
  const streak = calculateStreak(tracker as any[]);

  const handleLogout = () => {
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

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Text className="text-foreground font-semibold text-lg">Profile</Text>
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
      </View>

      {/* User info */}
      <View className="items-center pt-8 pb-6">
        {user?.image ? (
          <Image
            source={{ uri: user.image }}
            className="w-20 h-20 rounded-full mb-4"
          />
        ) : (
          <View className="w-20 h-20 rounded-full bg-secondary items-center justify-center mb-4">
            <Text className="text-foreground text-2xl font-bold">
              {user?.name?.charAt(0) ?? "?"}
            </Text>
          </View>
        )}
        <Text className="text-foreground font-semibold text-xl">{user?.name}</Text>
        <Text className="text-muted-foreground text-sm mt-1">{user?.email}</Text>
      </View>

      {/* Stats */}
      <View className="flex-row mx-4 mb-6 rounded-lg border border-border overflow-hidden">
        <View className="flex-1 items-center py-4 border-r border-border">
          <View className="flex-row items-center mb-1">
            <Zap size={16} color="#facc15" />
            <Text className="text-foreground font-bold text-lg ml-1">{user?.xp ?? 0}</Text>
          </View>
          <Text className="text-muted-foreground text-xs">XP Earned</Text>
        </View>
        <View className="flex-1 items-center py-4">
          <View className="flex-row items-center mb-1">
            <Flame size={16} color="#f97316" />
            <Text className="text-foreground font-bold text-lg ml-1">{streak}</Text>
          </View>
          <Text className="text-muted-foreground text-xs">Day Streak</Text>
        </View>
      </View>

      {/* Actions */}
      <View className="mx-4">
        <Pressable
          onPress={handleLogout}
          className="flex-row items-center py-4 border-t border-border"
        >
          <LogOut size={20} color="#ef4444" />
          <Text className="ml-3 font-medium" style={{ color: "#ef4444" }}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Version */}
      <View className="absolute bottom-8 left-0 right-0 items-center">
        <Text className="text-muted-foreground text-xs">MindTab v{appVersion}</Text>
      </View>
    </View>
  );
}
