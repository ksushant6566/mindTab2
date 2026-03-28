import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  FlatList,
  StyleSheet,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronsLeft, Plus } from "lucide-react-native";

import { useAuth } from "~/hooks/use-auth";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.78;
const ANIM_DURATION = 280;

type Conversation = {
  id: string;
  title: string | null;
  updated_at: string;
};

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  activeConversationId?: string;
  children: React.ReactNode;
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ChatSidebar({
  isOpen,
  onClose,
  activeConversationId,
  children,
}: ChatSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, {
      duration: ANIM_DURATION,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isOpen, progress]);

  const { data } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data } = await api.GET("/conversations" as any, {
        params: { query: { limit: 100, offset: 0 } },
      });
      return data ?? { items: [] };
    },
  });

  const conversations: Conversation[] = (data as any)?.items ?? [];

  const handleNewChat = useCallback(() => {
    onClose();
    router.replace("/(main)/(tabs)/chat");
  }, [onClose, router]);

  const handleConversationPress = useCallback(
    (id: string) => {
      onClose();
      router.push(`/(main)/chat/${id}`);
    },
    [onClose, router]
  );

  const sidebarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-SIDEBAR_WIDTH, 0]),
      },
    ],
  }));

  const contentShiftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [0, SIDEBAR_WIDTH]),
      },
    ],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.4]),
    pointerEvents: isOpen ? ("auto" as const) : ("none" as const),
  }));

  const initial = (user?.name?.[0] ?? "").toUpperCase();

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => {
      const isActive = item.id === activeConversationId;
      return (
        <Pressable
          onPress={() => handleConversationPress(item.id)}
          style={[styles.conversationRow, isActive && styles.conversationRowActive]}
        >
          <Text
            style={[styles.conversationTitle, isActive && styles.conversationTitleActive]}
            numberOfLines={1}
          >
            {item.title || "Untitled"}
          </Text>
          <Text style={styles.conversationTime}>
            {formatRelativeTime(item.updated_at)}
          </Text>
        </Pressable>
      );
    },
    [activeConversationId, handleConversationPress]
  );

  return (
    <View style={styles.wrapper}>
      {/* Sidebar panel */}
      <Animated.View style={[styles.sidebar, { paddingTop: insets.top }, sidebarStyle]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.push("/(screens)/profile")}>
              {user?.image ? (
                <Image source={{ uri: user.image }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initial}</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || "User"}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.collapseButton}>
            <ChevronsLeft size={20} color={colors.text.secondary} />
          </Pressable>
        </View>

        {/* New Chat Button */}
        <Pressable onPress={handleNewChat} style={styles.newChatButton}>
          <Plus size={16} color={colors.text.primary} />
          <Text style={styles.newChatText}>New Chat</Text>
        </Pressable>

        {/* Conversations */}
        <Text style={styles.sectionLabel}>Conversations</Text>
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>

      {/* Scrim overlay */}
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Main content — shifts right when sidebar opens */}
      <Animated.View style={[styles.content, contentShiftStyle]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    overflow: "hidden",
  },
  sidebar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.bg.elevated,
    borderRightWidth: 1,
    borderRightColor: colors.border.default,
    zIndex: 100,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#0a0a0a",
    fontSize: 13,
    fontWeight: "bold",
  },
  userName: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  collapseButton: {
    padding: 4,
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  newChatText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  sectionLabel: {
    color: colors.text.muted,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  conversationRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  conversationRowActive: {
    backgroundColor: colors.bg.surface,
  },
  conversationTitle: {
    color: colors.text.primary,
    fontSize: 14,
    marginBottom: 2,
  },
  conversationTitleActive: {
    fontWeight: "600",
  },
  conversationTime: {
    color: colors.text.muted,
    fontSize: 11,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 99,
  },
  content: {
    flex: 1,
  },
});
