import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Search, Menu } from "lucide-react-native";

import { useAuth } from "~/hooks/use-auth";
import { colors } from "~/styles/colors";

type DashboardHeaderProps = {
  activeTab: "chat" | "index" | "vault";
  onTabChange: (tab: "chat" | "index" | "vault") => void;
  onMenuPress?: () => void;
};

const TAB_ITEMS: { key: "chat" | "index" | "vault"; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "index", label: "Home" },
  { key: "vault", label: "Vault" },
];

export function DashboardHeader({ activeTab, onTabChange, onMenuPress }: DashboardHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();

  const initial = (user?.name?.[0] ?? "").toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Avatar or Hamburger menu (chat tab only) */}
        {activeTab === "chat" && onMenuPress ? (
          <Pressable onPress={onMenuPress} style={styles.menuButton}>
            <Menu size={22} color={colors.text.secondary} />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push("/(modals)/profile")}>
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}
          </Pressable>
        )}

        {/* Flex spacer */}
        <View style={{ flex: 1 }} />

        {/* Tab chips */}
        {TAB_ITEMS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={isActive ? styles.chipActive : styles.chipInactive}
            >
              <Text style={isActive ? styles.chipTextActive : styles.chipTextInactive}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Flex spacer */}
        <View style={{ flex: 1 }} />

        {/* Search */}
        <Pressable
          onPress={() => router.push("/(modals)/command-palette")}
          style={styles.searchButton}
        >
          <Search size={18} color="#a3a3a3" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: "bold",
  },
  chipActive: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipTextActive: {
    color: "#0a0a0a",
    fontSize: 13,
    fontWeight: "600",
  },
  chipInactive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipTextInactive: {
    color: "#666666",
    fontSize: 13,
  },
  searchButton: {
    padding: 6,
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
