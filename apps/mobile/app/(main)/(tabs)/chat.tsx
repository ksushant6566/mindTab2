import { View, StyleSheet, Keyboard, Pressable } from "react-native";
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, interpolate } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatEmptyState } from "~/components/chat/empty-state";
import { ChatInput } from "~/components/chat/chat-input";
import { colors } from "~/styles/colors";
import { useChatStore } from "~/hooks/use-chat-store";
import { useWebSocket } from "~/hooks/use-websocket";

const HEADER_HEIGHT = 48; // DashboardHeader: 36px row + 12px paddingBottom

export default function ChatTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const { progress } = useReanimatedKeyboardAnimation();

  const animatedPadding = useAnimatedStyle(() => ({
    paddingBottom: interpolate(progress.value, [0, 1], [36, 8]),
  }));

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior="padding"
      keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
    >
      <Animated.View style={[styles.container, animatedPadding]}>
        <Pressable style={styles.pressable} onPress={Keyboard.dismiss}>
          {/* Empty state centered */}
          <ChatEmptyState onSuggestionPress={handleSuggestionPress} />
        </Pressable>

        {/* Chat Input */}
        <ChatInput onSend={handleSend} disabled={!isConnected} />
      </Animated.View>
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
  },
  pressable: {
    flex: 1,
  },
});
