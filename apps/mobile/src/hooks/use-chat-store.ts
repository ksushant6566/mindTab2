import { create } from "zustand";

type ToolCallState = {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "calling" | "done";
};

type ChatState = {
  activeConversationId: string | null;
  streamingMessageId: string | null;
  streamBuffer: string;
  isStreaming: boolean;
  pendingToolCalls: ToolCallState[];

  setActiveConversation: (id: string | null) => void;
  startStream: (messageId: string) => void;
  appendDelta: (content: string) => void;
  addToolCall: (callId: string, tool: string, args: Record<string, unknown>) => void;
  resolveToolCall: (callId: string, result: unknown) => void;
  endStream: () => void;
  reset: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  streamingMessageId: null,
  streamBuffer: "",
  isStreaming: false,
  pendingToolCalls: [],

  setActiveConversation: (id) => set({ activeConversationId: id }),
  startStream: (messageId) =>
    set({ streamingMessageId: messageId, streamBuffer: "", isStreaming: true, pendingToolCalls: [] }),
  appendDelta: (content) =>
    set((state) => ({ streamBuffer: state.streamBuffer + content })),
  addToolCall: (callId, tool, args) =>
    set((state) => ({
      pendingToolCalls: [...state.pendingToolCalls, { callId, tool, args, status: "calling" }],
    })),
  resolveToolCall: (callId, result) =>
    set((state) => ({
      pendingToolCalls: state.pendingToolCalls.map((tc) =>
        tc.callId === callId && tc.status === "calling" ? { ...tc, result, status: "done" } : tc
      ),
    })),
  endStream: () => set({ isStreaming: false, streamingMessageId: null, streamBuffer: "", pendingToolCalls: [] }),
  reset: () =>
    set({
      activeConversationId: null,
      streamingMessageId: null,
      streamBuffer: "",
      isStreaming: false,
      pendingToolCalls: [],
    }),
}));
