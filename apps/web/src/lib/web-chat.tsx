import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authedFetch } from "~/api/client";
import {
  WebChatContext,
  type ChatContentPart,
  type ChatMessageRecord,
  type ChatToolCall,
  type ChatSendConfiguration,
  type ConnectionStatus,
  type WebChatContextValue,
} from "~/lib/web-chat-context";

type MessageListResponse = {
  items?: ChatMessageRecord[];
  total?: number;
};

function getWsBaseUrl() {
  const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin;
  return apiBaseUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function parseToolArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toolCallForCache(toolCall: ChatToolCall) {
  return {
    ID: toolCall.callId,
    Name: toolCall.tool,
    Arguments: JSON.stringify(toolCall.args),
    result: toolCall.result,
  };
}

function streamPartForCache(
  part: ChatContentPart,
  messageId: string,
  index: number,
): ChatMessageRecord {
  return {
    id: `${messageId}-${index}`,
    role: "assistant",
    content: part.type === "text" ? part.content : "",
    attachments: null,
    tool_calls: part.type === "tool" ? [toolCallForCache(part.toolCall)] : null,
    tool_call_id: null,
    created_at: new Date().toISOString(),
  };
}

export function WebChatProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const connectRef = useRef<() => Promise<void>>(async () => undefined);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const streamPartsRef = useRef<ChatContentPart[]>([]);
  const isStreamingRef = useRef(false);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamParts, setStreamParts] = useState<ChatContentPart[]>([]);

  const resetStream = useCallback(() => {
    streamPartsRef.current = [];
    setStreamParts([]);
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || reconnectTimerRef.current !== null) return;
    const delay = Math.min(1_000 * 2 ** reconnectAttemptRef.current, 10_000);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(async () => {
    const existing = socketRef.current;
    if (
      connectingRef.current ||
      existing?.readyState === WebSocket.OPEN ||
      existing?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    connectingRef.current = true;
    shouldReconnectRef.current = true;
    setConnectionStatus("connecting");
    setError(null);

    let ticket: string | undefined;
    try {
      const response = await authedFetch("/auth/ws-ticket", { method: "POST" });
      const data = response.ok ? await response.json() as { ticket?: string } : undefined;
      ticket = data?.ticket;
    } catch {
      ticket = undefined;
    }

    if (!shouldReconnectRef.current) {
      connectingRef.current = false;
      return;
    }

    if (!ticket) {
      connectingRef.current = false;
      setConnectionStatus("error");
      setError("MindTab could not connect to chat. Retrying…");
      scheduleReconnect();
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${getWsBaseUrl()}/ws/chat?ticket=${encodeURIComponent(ticket)}`);
    } catch {
      connectingRef.current = false;
      setConnectionStatus("error");
      setError("MindTab could not connect to chat. Retrying…");
      scheduleReconnect();
      return;
    }
    socketRef.current = socket;
    connectingRef.current = false;

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setConnectionStatus("connected");
      setError(null);
    };

    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(message.type ?? "");
      if (type === "stream.start") {
        const nextConversationId = typeof message.conversation_id === "string"
          ? message.conversation_id
          : activeConversationIdRef.current;
        activeConversationIdRef.current = nextConversationId;
        setActiveConversationId(nextConversationId);
        streamPartsRef.current = [];
        setStreamParts([]);
        setError(null);
        isStreamingRef.current = true;
        setIsStreaming(true);
        return;
      }

      if (type === "stream.delta") {
        const delta = String(message.content ?? "");
        const previousParts = streamPartsRef.current;
        const previousPart = previousParts.at(-1);
        streamPartsRef.current = previousPart?.type === "text"
          ? [
              ...previousParts.slice(0, -1),
              { ...previousPart, content: previousPart.content + delta },
            ]
          : [
              ...previousParts,
              {
                id: `stream-text-${previousParts.length}`,
                type: "text",
                content: delta,
              },
            ];
        setStreamParts(streamPartsRef.current);
        return;
      }

      if (type === "stream.tool_call") {
        const nextToolCall: ChatToolCall = {
          callId: String(message.call_id ?? `${message.tool ?? "tool"}-${Date.now()}`),
          tool: String(message.tool ?? "tool"),
          args: parseToolArgs(message.args),
          status: "calling",
        };
        streamPartsRef.current = [
          ...streamPartsRef.current,
          { id: nextToolCall.callId, type: "tool", toolCall: nextToolCall },
        ];
        setStreamParts(streamPartsRef.current);
        return;
      }

      if (type === "stream.tool_result") {
        const callId = String(message.call_id ?? "");
        const result = message.result;
        const isError = Boolean(
          result && typeof result === "object" && "error" in result,
        );
        streamPartsRef.current = streamPartsRef.current.map((part) =>
          part.type === "tool" && part.toolCall.callId === callId
            ? {
                ...part,
                toolCall: {
                  ...part.toolCall,
                  result,
                  status: isError ? "error" : "done",
                },
              }
            : part,
        );
        setStreamParts(streamPartsRef.current);
        return;
      }

      if (type === "stream.end") {
        const completedConversationId = typeof message.conversation_id === "string"
          ? message.conversation_id
          : activeConversationIdRef.current;
        const completedParts = streamPartsRef.current;

        if (completedConversationId && completedParts.length > 0) {
          queryClient.setQueryData<MessageListResponse>(
            ["conversations", completedConversationId, "messages"],
            (current) => {
              const items = current?.items ?? [];
              const messageId = String(message.message_id ?? `stream-${Date.now()}`);
              const cachedParts = completedParts.map((part, index) => (
                streamPartForCache(part, messageId, index)
              ));
              if (items.some((item) => item.id === cachedParts[0]?.id)) return current;
              return {
                ...current,
                items: [...items, ...cachedParts],
                total: (current?.total ?? items.length) + cachedParts.length,
              };
            },
          );
          void queryClient.invalidateQueries({
            queryKey: ["conversations", completedConversationId, "messages"],
          });
        }

        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        resetStream();
        return;
      }

      if (type === "conversation.title") {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }

      if (type === "error") {
        const nextError = String(message.message ?? "MindTab could not complete that response.");
        setError(nextError);
        resetStream();
      }
    };

    socket.onerror = () => {
      setConnectionStatus("error");
      setError("The chat connection was interrupted.");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnectionStatus("disconnected");
      if (isStreamingRef.current) {
        setError("The response was interrupted. You can send the message again.");
        resetStream();
      }
      scheduleReconnect();
    };
  }, [queryClient, resetStream, scheduleReconnect]);

  connectRef.current = connect;

  const sendMessage = useCallback(
    (
      content: string,
      configuration: ChatSendConfiguration,
      conversationId?: string,
      attachments?: string[],
    ) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      if (isStreamingRef.current) return false;
      if (!content.trim() && (!attachments || attachments.length === 0)) return false;

      const targetConversationId = conversationId || undefined;
      activeConversationIdRef.current = targetConversationId ?? null;
      setActiveConversationId(targetConversationId ?? null);
      setError(null);
      streamPartsRef.current = [];
      setStreamParts([]);
      isStreamingRef.current = true;
      setIsStreaming(true);
      try {
        socket.send(JSON.stringify({
          type: "message.send",
          content: content.trim(),
          provider: configuration.provider,
          model: configuration.model,
          project_id: configuration.projectId ?? "",
          ...(targetConversationId ? { conversation_id: targetConversationId } : {}),
          ...(attachments?.length ? { attachments } : {}),
        }));
      } catch {
        resetStream();
        return false;
      }
      return true;
    },
    [resetStream],
  );

  const cancelStream = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "message.cancel" }));
    resetStream();
  }, [resetStream]);

  useEffect(() => () => {
    shouldReconnectRef.current = false;
    connectingRef.current = false;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
    }
    socketRef.current = null;
  }, []);

  const value = useMemo<WebChatContextValue>(() => ({
    activeConversationId,
    cancelStream,
    connect,
    connectionStatus,
    error,
    isStreaming,
    sendMessage,
    streamParts,
  }), [
    activeConversationId,
    cancelStream,
    connect,
    connectionStatus,
    error,
    isStreaming,
    sendMessage,
    streamParts,
  ]);

  return <WebChatContext.Provider value={value}>{children}</WebChatContext.Provider>;
}
