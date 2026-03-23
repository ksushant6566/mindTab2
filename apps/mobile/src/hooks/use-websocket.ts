import { useEffect, useRef, useCallback, useState } from "react";
import { AppState } from "react-native";
import { useChatStore } from "./use-chat-store";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "~/lib/auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

const WS_URL = toWsUrl(API_URL);

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalDisconnectRef.current = false;

    const token = await getAccessToken();
    if (!token) {
      console.warn("[useWebSocket] No access token available, skipping connect");
      return;
    }

    const url = `${WS_URL}/ws/chat?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event: WebSocketMessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch (e) {
        console.error("[useWebSocket] Failed to parse message", e);
        return;
      }

      const type = msg.type as string | undefined;
      const state = useChatStore.getState();

      switch (type) {
        case "stream.start":
          state.startStream(msg.message_id as string);
          state.setActiveConversation(msg.conversation_id as string);
          break;

        case "stream.delta":
          state.appendDelta(msg.content as string);
          break;

        case "stream.tool_call":
          state.addToolCall(msg.tool as string, msg.args as Record<string, unknown>);
          break;

        case "stream.tool_result":
          state.resolveToolCall(msg.tool as string, msg.result);
          break;

        case "stream.end": {
          // Snapshot streaming state BEFORE clearing it
          const conversationId = state.activeConversationId;
          const completedContent = state.streamBuffer;
          const toolCalls = state.pendingToolCalls
            .filter((tc) => tc.status === "done")
            .map((tc) => ({
              Name: tc.tool,
              Arguments: JSON.stringify(tc.args ?? {}),
            }));

          // Insert completed message into cache BEFORE clearing streaming state
          // This prevents the gap where the streaming bubble disappears but the
          // refetched message hasn't arrived yet
          if (conversationId) {
            queryClient.setQueryData(["messages", conversationId], (old: any) => {
              const completedMsg = {
                id: msg.message_id || `completed-${Date.now()}`,
                role: "assistant",
                content: completedContent,
                tool_calls: toolCalls.length > 0 ? toolCalls : null,
                tool_call_id: null,
                created_at: new Date().toISOString(),
              };
              const items = old?.items ? [...old.items, completedMsg] : [completedMsg];
              return { ...old, items };
            });
          }

          // NOW clear streaming state — the cached message is already in the list
          state.endStream();

          // Background refetch to get canonical server data (proper IDs, etc.)
          queryClient.invalidateQueries({ queryKey: ["messages"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;
        }

        case "conversation.title":
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;

        case "error":
          state.endStream();
          console.error("[useWebSocket] Server error:", msg.message ?? msg);
          break;

        default:
          console.warn("[useWebSocket] Unknown message type:", type);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      // Clean up stale streaming state — stream.end will never arrive on a dead connection
      const chatState = useChatStore.getState();
      if (chatState.isStreaming) {
        chatState.endStream();
      }

      if (!intentionalDisconnectRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error("[useWebSocket] WebSocket error:", error);
    };
  }, [queryClient]);

  const sendMessage = useCallback(
    (content: string, conversationId?: string, attachments?: unknown[]) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[useWebSocket] Cannot send message: not connected");
        return;
      }

      const payload: Record<string, unknown> = {
        type: "message.send",
        content,
      };

      if (conversationId) {
        payload.conversation_id = conversationId;
      }

      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }

      wsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  const cancelStream = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[useWebSocket] Cannot cancel stream: not connected");
      return;
    }

    wsRef.current.send(JSON.stringify({ type: "message.cancel" }));
  }, []);

  // Reconnect when app comes back to foreground (iOS kills WS connections in background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        nextState === "active" &&
        !intentionalDisconnectRef.current &&
        (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      ) {
        connect();
      }
    });
    return () => subscription.remove();
  }, [connect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { connect, disconnect, sendMessage, cancelStream, isConnected };
}
