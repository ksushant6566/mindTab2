import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { conversationMessagesQueryOptions } from "~/api/hooks";
import { api } from "~/api/client";
import { ChatComposer, ChatEmptyState, ChatMessageBubble, ChatPanel } from "~/components/domain/chat";
import { LoadingState, SkeletonBlock } from "~/components/patterns";
import { Heading, MetaText } from "~/components/ui/typography";

type MessageRecord = {
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    created_at?: string;
};

function getWsBaseUrl() {
    const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    return apiBaseUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function useWebChatSocket(conversationId?: string) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const activeConversationIdRef = useRef<string | undefined>(conversationId);
    const [isConnected, setIsConnected] = useState(false);
    const [streamBuffer, setStreamBuffer] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        activeConversationIdRef.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
        let closed = false;

        async function connect() {
            const { data, error } = await api.POST("/auth/ws-ticket" as any, {});
            const ticket = (data as any)?.ticket;
            if (closed || error || !ticket) return;

            const ws = new WebSocket(`${getWsBaseUrl()}/ws/chat?ticket=${encodeURIComponent(ticket)}`);
            wsRef.current = ws;

            ws.onopen = () => setIsConnected(true);
            ws.onclose = () => {
                setIsConnected(false);
                setIsStreaming(false);
            };
            ws.onmessage = (event) => {
                let message: Record<string, unknown>;
                try {
                    message = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (message.type === "stream.start") {
                    setIsStreaming(true);
                    setStreamBuffer("");
                    const nextConversationId = message.conversation_id as string | undefined;
                    if (nextConversationId) {
                        activeConversationIdRef.current = nextConversationId;
                        if (!conversationId) {
                            void navigate({ to: "/chat/$conversationId", params: { conversationId: nextConversationId } });
                        }
                    }
                }

                if (message.type === "stream.delta") {
                    setStreamBuffer((current) => current + String(message.content ?? ""));
                }

                if (message.type === "stream.end") {
                    setIsStreaming(false);
                    setStreamBuffer("");
                    const activeId = activeConversationIdRef.current;
                    if (activeId) {
                        void queryClient.invalidateQueries({ queryKey: ["conversations", activeId, "messages"] });
                    }
                    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
                }

                if (message.type === "error") {
                    setIsStreaming(false);
                    setStreamBuffer("");
                }
            };
        }

        void connect();

        return () => {
            closed = true;
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [conversationId, navigate, queryClient]);

    const sendMessage = useCallback((content: string) => {
        const ws = wsRef.current;
        if (!content.trim() || !ws || ws.readyState !== WebSocket.OPEN) return false;
        const payload: Record<string, unknown> = {
            type: "message.send",
            content: content.trim(),
        };
        if (activeConversationIdRef.current) {
            payload.conversation_id = activeConversationIdRef.current;
        }
        ws.send(JSON.stringify(payload));
        return true;
    }, []);

    return { isConnected, isStreaming, streamBuffer, sendMessage };
}

export function WebChatPage({ conversationId }: { conversationId?: string }) {
    const [draft, setDraft] = useState("");
    const { data: messagesData, isLoading } = useQuery({
        ...conversationMessagesQueryOptions(conversationId || "00000000-0000-0000-0000-000000000000"),
        enabled: Boolean(conversationId),
    });
    const { isConnected, isStreaming, streamBuffer, sendMessage } = useWebChatSocket(conversationId);

    const messages = useMemo(() => ((messagesData as { items?: MessageRecord[] })?.items ?? []), [messagesData]);

    return (
        <ChatPanel className="w-full max-w-5xl rounded-[var(--r-3)] border border-border bg-card/70">
            <div className="border-b border-border px-5 py-4">
                <Heading as="h1" variant="section">{conversationId ? "Chat" : "New chat"}</Heading>
                <MetaText as="p" className="mt-1">{isConnected ? "Connected" : "Connecting..."}</MetaText>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {!conversationId ? (
                    <ChatEmptyState
                        title="Start a new conversation"
                        description="Ask MindTab to reason across your tasks, projects, notes, and saved material."
                    />
                ) : isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <SkeletonBlock key={index} className="h-20" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((message) => (
                            <ChatMessageBubble
                                key={message.id}
                                role={message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "system"}
                            >
                                <div className="whitespace-pre-wrap">{message.content}</div>
                            </ChatMessageBubble>
                        ))}
                        {isStreaming && streamBuffer && (
                            <ChatMessageBubble role="assistant">
                                <div className="whitespace-pre-wrap">{streamBuffer}</div>
                            </ChatMessageBubble>
                        )}
                        {isStreaming && !streamBuffer ? <LoadingState label="Thinking" className="justify-start" /> : null}
                    </div>
                )}
            </div>

            <div className="border-t border-border p-4">
                <ChatComposer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={() => {
                        if (sendMessage(draft)) setDraft("");
                    }}
                    placeholder="Ask anything..."
                    disabled={!isConnected}
                />
            </div>
        </ChatPanel>
    );
}
