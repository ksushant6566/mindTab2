import { useEffect, useRef, useCallback, useState } from "react";
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

  const store = useChatStore();
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

      switch (type) {
        case "stream.start":
          store.startStream(msg.message_id as string);
          store.setActiveConversation(msg.conversation_id as string);
          break;

        case "stream.delta":
          store.appendDelta(msg.content as string);
          break;

        case "stream.tool_call":
          store.addToolCall(msg.tool as string, msg.args as Record<string, unknown>);
          break;

        case "stream.tool_result":
          store.resolveToolCall(msg.tool as string, msg.result);
          break;

        case "stream.end":
          store.endStream();
          queryClient.invalidateQueries({ queryKey: ["messages"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;

        case "conversation.title":
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;

        case "error":
          store.endStream();
          console.error("[useWebSocket] Server error:", msg.message ?? msg);
          break;

        default:
          console.warn("[useWebSocket] Unknown message type:", type);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (!intentionalDisconnectRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error("[useWebSocket] WebSocket error:", error);
    };
  }, [store, queryClient]);

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
