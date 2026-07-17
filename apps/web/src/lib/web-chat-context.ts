import type { components } from "@mindtab/api-spec";
import { createContext, useContext } from "react";

export type ChatMessageRecord = components["schemas"]["MessageItem"];

export type ChatToolCall = {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "calling" | "done" | "error";
};

export type ChatContentPart =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "tool"; toolCall: ChatToolCall };

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type ChatSendConfiguration = {
  provider: string;
  model: string;
  projectId: string | null;
};

export type WebChatContextValue = {
  activeConversationId: string | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
  isStreaming: boolean;
  streamParts: ChatContentPart[];
  cancelStream: () => void;
  connect: () => Promise<void>;
  sendMessage: (
    content: string,
    configuration: ChatSendConfiguration,
    conversationId?: string,
    attachments?: string[],
  ) => boolean;
};

export const WebChatContext = createContext<WebChatContextValue | null>(null);

export function useWebChat() {
  const context = useContext(WebChatContext);
  if (!context) throw new Error("useWebChat must be used within WebChatProvider");
  return context;
}
