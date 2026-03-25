import { View, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ChatEmptyState } from "~/components/chat/empty-state";
import { ChatInput } from "~/components/chat/chat-input";
import { colors } from "~/styles/colors";
import { useChatStore } from "~/hooks/use-chat-store";
import { useWebSocket } from "~/hooks/use-websocket";

export default function ChatTab() {
  const router = useRouter();
  const { connect, sendMessage, isConnected } = useWebSocket();
  const { activeConversationId } = useChatStore();

  // Track whether a navigation to new conversation is pending from this tab
  const pendingNavigationRef = useRef(false);

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

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* Empty state centered */}
        <ChatEmptyState onSuggestionPress={handleSuggestionPress} />

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
});
