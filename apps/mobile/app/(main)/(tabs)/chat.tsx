import { View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "~/lib/api-client";
import { ChatEmptyState } from "~/components/chat/empty-state";
import { ConversationRow } from "~/components/chat/conversation-row";
import { ChatInput } from "~/components/chat/chat-input";
import { colors } from "~/styles/colors";
import { useChatStore } from "~/hooks/use-chat-store";
import { useWebSocket } from "~/hooks/use-websocket";

type Conversation = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export default function ChatTab() {
  const router = useRouter();
  const { connect, sendMessage, isConnected } = useWebSocket();
  const { activeConversationId } = useChatStore();

  // Track whether a navigation to new conversation is pending from this tab
  const pendingNavigationRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data } = await api.GET("/conversations" as any, {
        params: { query: { limit: 5, offset: 0 } },
      });
      return data;
    },
  });

  const conversations: Conversation[] = (data as any)?.items ?? [];

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Navigate to the new conversation when stream.start sets activeConversationId
  useEffect(() => {
    if (pendingNavigationRef.current && activeConversationId) {
      pendingNavigationRef.current = false;
      router.push(`/(main)/chat/${activeConversationId}`);
    }
  }, [activeConversationId, router]);

  const handleSuggestionPress = (text: string) => {
    pendingNavigationRef.current = true;
    useChatStore.getState().setActiveConversation(null);
    sendMessage(text, undefined);
  };

  const handleSend = (text: string, attachments: string[]) => {
    if (!text.trim() && attachments.length === 0) return;
    pendingNavigationRef.current = true;
    useChatStore.getState().setActiveConversation(null);
    sendMessage(text, undefined, attachments);
  };

  const handleConversationPress = (id: string) => {
    router.push(`/(main)/chat/${id}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* Empty state centered */}
        <ChatEmptyState onSuggestionPress={handleSuggestionPress} />

        {/* Recent conversations at bottom */}
        {conversations.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentLabel}>RECENT</Text>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ConversationRow
                  id={item.id}
                  title={item.title}
                  updatedAt={item.updatedAt}
                  onPress={handleConversationPress}
                />
              )}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Chat Input */}
        <ChatInput onSend={handleSend} disabled={!isConnected} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  recentSection: {
    paddingBottom: 8,
  },
  recentLabel: {
    color: "#555555",
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  listContent: {
    gap: 2,
  },
});
