import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react-native";
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

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList<ListItem>>(null);

  const { sendMessage, connect, isConnected } = useWebSocket();
  const { isStreaming, streamBuffer, pendingToolCalls, activeConversationId } =
    useChatStore();

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

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

  const rawMessages: Message[] = (messagesData as any)?.items ?? [];

  // Filter out tool-result messages and empty intermediate assistant messages
  // (tool activity is already shown via ToolIndicator)
  const messages = rawMessages.filter((msg) => {
    if (msg.role === "tool") return false;
    if (msg.role === "assistant" && !msg.content && msg.tool_calls?.length) return false;
    return true;
  });

  // Build list items: static messages + optional streaming item
  const listItems = React.useMemo<ListItem[]>(() => {
    const items: ListItem[] = messages.map((msg) => ({
      type: "message",
      message: msg,
    }));
    // Show streaming item when streaming in this conversation
    if (isStreaming && activeConversationId === id) {
      items.push({ type: "streaming" });
    }
    return items;
  }, [messages, isStreaming, activeConversationId, id]);

  // Auto-scroll to bottom when messages or streaming buffer changes
  useEffect(() => {
    if (listItems.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [listItems.length, streamBuffer]);

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

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "streaming") {
        return (
          <View style={styles.messageWrapper}>
            {pendingToolCalls.map((tc, idx) => (
              <ToolIndicator
                key={`pending-tool-${idx}`}
                tool={tc.tool}
                status={tc.status}
                args={tc.args}
                result={tc.result}
              />
            ))}
            <MessageBubble
              role="assistant"
              content={streamBuffer}
              isStreaming
            />
          </View>
        );
      }

      const msg = item.message;
      const toolCalls = normalizeToolCalls(msg.tool_calls);
      return (
        <View style={styles.messageWrapper}>
          {toolCalls.length > 0 &&
            toolCalls.map((tc, idx) => (
              <ToolIndicator
                key={`tool-${msg.id}-${idx}`}
                tool={tc.tool}
                status={tc.status}
                args={tc.args}
                result={tc.result}
              />
            ))}
          <MessageBubble role={msg.role as "user" | "assistant"} content={msg.content} />
        </View>
      );
    },
    [streamBuffer, pendingToolCalls]
  );

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    if (item.type === "streaming") return "streaming";
    return item.message.id ?? `msg-${index}`;
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: conversationTitle,
          headerShown: true,
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
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
        />

        <View style={styles.inputContainer}>
          <ChatInput
            onSend={(text, attachments) => {
              sendMessage(text, id, attachments);
            }}
            disabled={!isConnected}
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
});
