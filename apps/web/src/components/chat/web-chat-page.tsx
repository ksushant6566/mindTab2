import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { conversationMessagesQueryOptions } from "~/api/hooks";
import { api } from "~/api/client";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

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

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (sendMessage(draft)) {
            setDraft("");
        }
    };

    return (
        <div className="flex h-full min-h-0 w-full max-w-5xl flex-col rounded-[var(--r-3)] border border-border bg-card/70">
            <div className="border-b border-border px-5 py-4">
                <h1 className="text-lg font-semibold text-foreground">{conversationId ? "Chat" : "New chat"}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{isConnected ? "Connected" : "Connecting..."}</p>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {!conversationId ? (
                    <div className="flex h-full min-h-[300px] items-center justify-center text-center">
                        <div>
                            <div className="text-xl font-semibold text-foreground">Start a new conversation</div>
                            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                                Ask MindTab to reason across your tasks, projects, notes, and saved material.
                            </p>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-20 animate-pulse rounded-[var(--r-2)] bg-secondary" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "max-w-[78%] rounded-[var(--r-3)] border px-4 py-3 text-sm leading-6",
                                    message.role === "user"
                                        ? "ml-auto border-primary/25 bg-primary text-primary-foreground"
                                        : "border-border bg-background"
                                )}
                            >
                                <div className="whitespace-pre-wrap">{message.content}</div>
                            </div>
                        ))}
                        {isStreaming && streamBuffer && (
                            <div className="max-w-[78%] rounded-[var(--r-3)] border border-border bg-background px-4 py-3 text-sm leading-6">
                                <div className="whitespace-pre-wrap">{streamBuffer}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-border p-4">
                <div className="flex items-end gap-3">
                    <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Ask anything..."
                        className="min-h-[52px] resize-none"
                        onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                event.currentTarget.form?.requestSubmit();
                            }
                        }}
                    />
                    <Button type="submit" size="icon" disabled={!isConnected || !draft.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
}
