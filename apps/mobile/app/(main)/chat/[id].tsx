import React, { useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Menu } from "lucide-react-native";
import { useChatSidebar } from "~/hooks/use-chat-sidebar";
import { api } from "~/lib/api-client";
import { useChatStore } from "~/hooks/use-chat-store";
import { useWebSocket } from "~/hooks/use-websocket";
import { MessageBubble } from "~/components/chat/message-bubble";
import { ToolIndicator } from "~/components/chat/tool-indicator";
import { ChatInput } from "~/components/chat/chat-input";
import { colors } from "~/styles/colors";

type ToolCallData = {
  tool: string;
  status: "calling" | "done";
  args?: Record<string, unknown>;
  result?: unknown;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<Record<string, unknown>>;
  createdAt?: string;
};

// Server stores tool_calls as Go structs: {ID, Name, Arguments}
// Normalize to the shape our components expect
function normalizeToolCalls(raw?: Array<Record<string, unknown>>): ToolCallData[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((tc) => ({
    tool: (tc.Name as string) || (tc.name as string) || (tc.tool as string) || "",
    status: "done" as const,
    args: tc.Arguments ? (() => { try { return JSON.parse(tc.Arguments as string); } catch { return undefined; } })() : (tc.args as Record<string, unknown>),
    result: tc.result as unknown,
  }));
}

type ListItem =
  | { type: "message"; message: Message }
  | { type: "streaming" };

// Streaming bubble reads from zustand directly — isolated re-renders,
// doesn't force FlatList to recreate renderItem on every token.
const StreamingBubble = React.memo(function StreamingBubble() {
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const pendingToolCalls = useChatStore((s) => s.pendingToolCalls);

  return (
    <View style={styles.messageWrapper}>
      {pendingToolCalls.map((tc, idx) => (
        <ToolIndicator
          key={`pending-tool-${idx}`}
          tool={tc.tool}
          status={tc.status}
        />
      ))}
      <MessageBubble role="assistant" content={streamBuffer} isStreaming />
    </View>
  );
});

// Static message row — memoized so it never re-renders unless the message changes
const MessageRow = React.memo(function MessageRow({ message }: { message: Message }) {
  const toolCalls = normalizeToolCalls(message.tool_calls);
  return (
    <View style={styles.messageWrapper}>
      {toolCalls.length > 0 &&
        toolCalls.map((tc, idx) => (
          <ToolIndicator
            key={`tool-${message.id}-${idx}`}
            tool={tc.tool}
            status={tc.status}
          />
        ))}
      {/* Only render bubble if there's content — tool-only messages just show indicators */}
      {message.content ? (
        <MessageBubble role={message.role as "user" | "assistant"} content={message.content} />
      ) : null}
    </View>
  );
});

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList<ListItem>>(null);
  const isAtBottomRef = useRef(true);

  const { sendMessage, connect, isConnected } = useWebSocket();
  const openSidebar = useChatSidebar((s) => s.open);
  // Only subscribe to the fields needed for list composition — NOT streamBuffer
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Sync active conversation ID to store so sidebar highlights correctly
  useEffect(() => {
    useChatStore.getState().setActiveConversation(id);
  }, [id]);

  // Get conversation title from cached conversations list
  const cachedConversations = queryClient.getQueryData(["conversations"]);
  const cachedConversation = (cachedConversations as any)?.items?.find(
    (c: any) => c.id === id
  );

  // Fetch messages
  const { data: messagesData } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data } = await api.GET("/conversations/{id}/messages" as any, {
        params: { path: { id }, query: { limit: 50, offset: 0 } },
      });
      return data;
    },
    enabled: !!id,
  });

  // Memoize the filtered messages to avoid new array on every render
  const messages = useMemo(() => {
    const raw: Message[] = (messagesData as any)?.items ?? [];
    return raw.filter((msg) => {
      // Remove raw tool result messages
      if (msg.role === "tool") return false;
      // Remove intermediate assistant messages that only have tool call args as content
      // (the orchestrator saves iterText which can be raw JSON from the LLM)
      if (msg.role === "assistant" && msg.tool_calls?.length && msg.content) {
        const trimmed = msg.content.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
      }
      return true;
    });
  }, [messagesData]);

  // Build list items: static messages + optional streaming item
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = messages.map((msg) => ({
      type: "message" as const,
      message: msg,
    }));
    if (isStreaming && activeConversationId === id) {
      items.push({ type: "streaming" });
    }
    return items;
  }, [messages, isStreaming, activeConversationId, id]);

  // Single scroll handler — only on content size change, only if near bottom
  const handleContentSizeChange = useCallback(() => {
    if (isAtBottomRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, []);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isAtBottomRef.current = distanceFromBottom < 80;
  }, []);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Conversation",
      "This conversation will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.DELETE("/conversations/{id}" as any, {
                params: { path: { id } },
              });
              queryClient.invalidateQueries({ queryKey: ["conversations"] });
              router.back();
            } catch (e) {
              console.error("[ConversationDetail] Failed to delete:", e);
            }
          },
        },
      ]
    );
  }, [id, queryClient, router]);

  const conversationTitle = cachedConversation?.title ?? "Chat";

  // renderItem is stable — no streaming state in deps
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "streaming") {
      return <StreamingBubble />;
    }
    return <MessageRow message={item.message} />;
  }, []);

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    if (item.type === "streaming") return "streaming";
    // Strip "optimistic-" prefix for stable keys across refetch
    const msgId = item.message.id;
    return msgId?.startsWith("optimistic-") ? `user-msg-${index}` : (msgId ?? `msg-${index}`);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: conversationTitle,
          headerShown: true,
          headerLeft: () => (
            <Pressable onPress={openSidebar} style={styles.menuButton}>
              <Menu size={22} color={colors.text.secondary} />
            </Pressable>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Options", "", [
                  {
                    text: "Delete conversation",
                    style: "destructive",
                    onPress: handleDelete,
                  },
                  { text: "Cancel", style: "cancel" },
                ])
              }
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreHorizontal size={20} color={colors.text.secondary} strokeWidth={2} />
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={listItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={100}
        />

        <View style={styles.inputContainer}>
          <ChatInput
            onSend={(text, attachments) => {
              // Optimistically add user message to the list immediately
              queryClient.setQueryData(["messages", id], (old: any) => {
                const optimisticMsg = {
                  id: `optimistic-${Date.now()}`,
                  role: "user",
                  content: text,
                  attachments: attachments.length > 0 ? attachments : null,
                  tool_calls: null,
                  tool_call_id: null,
                  created_at: new Date().toISOString(),
                };
                const items = old?.items ? [...old.items, optimisticMsg] : [optimisticMsg];
                return { ...old, items };
              });
              sendMessage(text, id, attachments);
            }}
            disabled={!isConnected || (isStreaming && activeConversationId === id)}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  messageWrapper: {
    gap: 4,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 12 : 16,
    paddingTop: 8,
  },
  headerButton: {
    marginRight: 4,
  },
  menuButton: {
    marginRight: 8,
    padding: 4,
  },
});
