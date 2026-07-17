import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import { toast } from "sonner";
import {
  aiProvidersQueryOptions,
  conversationMessagesQueryOptions,
  conversationsQueryOptions,
  projectsQueryOptions,
} from "~/api/hooks";
import {
  ChatComposer,
  ChatConversation,
  ChatEmptyState,
  ChatErrorNotice,
  ChatLoadingTranscript,
  ChatMessage,
  ChatPanel,
} from "~/components/domain/chat";
import { normalizeChatMessages } from "~/lib/chat-message-records";
import {
  useWebChat,
  type ChatMessageRecord,
} from "~/lib/web-chat-context";

export function WebChatPage({ conversationId }: { conversationId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pendingNewConversationRef = useRef(false);
  const initializedConversationRef = useRef<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const {
    activeConversationId,
    cancelStream,
    connect,
    connectionStatus,
    error,
    isStreaming,
    sendMessage,
    streamParts,
  } = useWebChat();

  const { data: messagesData, isLoading } = useQuery({
    ...conversationMessagesQueryOptions(conversationId || "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(conversationId),
  });
  const { data: providers = [] } = useQuery(aiProvidersQueryOptions());
  const { data: projectsData = [] } = useQuery(projectsQueryOptions({ includeArchived: false }));
  const { data: conversationsData } = useQuery(conversationsQueryOptions({ limit: 100, offset: 0 }));
  const conversations = conversationsData?.items ?? [];
  const conversation = conversationId
    ? conversations.find((item) => item.id === conversationId)
    : undefined;
  const models = useMemo(() => providers.flatMap((provider) => (
    provider.configured
      ? provider.models.map((model) => ({
          value: `${provider.id}::${model.id}`,
          name: model.name,
          providerName: provider.managed ? "MindTab" : provider.name,
          provider: provider.id,
          model: model.id,
        }))
      : []
  )), [providers]);
  const projects = useMemo(() => projectsData.map((project) => ({
    id: project.id,
    name: project.name || "Untitled project",
  })), [projectsData]);
  const rawMessages = useMemo(
    () => (messagesData as { items?: ChatMessageRecord[] } | undefined)?.items ?? [],
    [messagesData],
  );
  const messages = useMemo(() => normalizeChatMessages(rawMessages), [rawMessages]);

  const streamBelongsHere = isStreaming && (
    activeConversationId === conversationId ||
    (!conversationId && pendingNewConversationRef.current)
  );

  useEffect(() => {
    void connect();
  }, [connect]);

  useEffect(() => {
    const pageKey = conversationId ?? "new";
    if (initializedConversationRef.current === pageKey) return;
    if (conversationId && !conversation) return;
    if (!conversationId && models.length === 0) return;

    setSelectedModel(conversation
      ? `${conversation.provider}::${conversation.model}`
      : models[0]?.value ?? "");
    setSelectedProjectId(conversation?.project_id ?? null);
    initializedConversationRef.current = pageKey;
  }, [conversation, conversationId, models]);

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModel("");
      return;
    }
    if (!models.some((model) => model.value === selectedModel)) {
      setSelectedModel(models[0]!.value);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    if (
      !conversationId &&
      pendingNewConversationRef.current &&
      activeConversationId
    ) {
      pendingNewConversationRef.current = false;
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: activeConversationId },
        replace: true,
      });
    }
  }, [activeConversationId, conversationId, navigate]);

  const submitMessage = useCallback((text: string) => {
    const content = text.trim();
    if (!content) return false;
    const selected = models.find((model) => model.value === selectedModel);
    if (!selected) {
      toast.error("Add an API key in Settings → Models before starting a chat.");
      return false;
    }

    if (!conversationId) pendingNewConversationRef.current = true;
    if (conversationId) {
      queryClient.setQueryData<{ items?: ChatMessageRecord[]; total?: number }>(
        ["conversations", conversationId, "messages"],
        (current) => {
          const items = current?.items ?? [];
          return {
            ...current,
            items: [
              ...items,
              {
                id: `optimistic-${Date.now()}`,
                role: "user",
                content,
                attachments: null,
                tool_calls: null,
                tool_call_id: null,
                created_at: new Date().toISOString(),
              },
            ],
            total: (current?.total ?? items.length) + 1,
          };
        },
      );
    }

    const sent = sendMessage(content, {
      provider: selected.provider,
      model: selected.model,
      projectId: selectedProjectId,
    }, conversationId);
    if (!sent) {
      pendingNewConversationRef.current = false;
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ["conversations", conversationId, "messages"],
        });
      }
      toast.error("Chat is still connecting. Try again in a moment.");
    }
    return sent;
  }, [conversationId, models, queryClient, selectedModel, selectedProjectId, sendMessage]);

  const chatStatus: ChatStatus = error
    ? "error"
    : streamBelongsHere
      ? "streaming"
      : connectionStatus === "connected"
        ? "ready"
        : "submitted";
  const resolvedConnectionStatus = connectionStatus === "connected"
    ? "connected"
    : connectionStatus === "error"
      ? "error"
      : "connecting";
  return (
    <ChatPanel>
      {!conversationId && !streamBelongsHere ? (
        <ChatEmptyState onSuggestion={(prompt) => submitMessage(prompt)} />
      ) : isLoading && conversationId ? (
        <ChatLoadingTranscript />
      ) : (
        <ChatConversation>
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              parts={message.parts}
              createdAt={message.createdAt}
            />
          ))}
          {streamBelongsHere ? (
            <ChatMessage
              role="assistant"
              parts={streamParts}
              isStreaming
            />
          ) : null}
        </ChatConversation>
      )}

      {error ? <ChatErrorNotice>{error}</ChatErrorNotice> : null}
      <ChatComposer
        status={chatStatus}
        connectionStatus={resolvedConnectionStatus}
        disabled={connectionStatus !== "connected" || (isStreaming && !streamBelongsHere)}
        models={models}
        projects={projects}
        selectedModel={selectedModel}
        selectedProjectId={selectedProjectId}
        onModelChange={setSelectedModel}
        onProjectChange={setSelectedProjectId}
        onStop={cancelStream}
        onSubmit={async ({ text }) => {
          if (!submitMessage(text)) throw new Error("Message was not sent");
        }}
      />
    </ChatPanel>
  );
}
