import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "~/api/client";
import { conversationMessagesQueryOptions } from "~/api/hooks";
import { ChatConversationActions } from "~/components/domain/chat";
import { buildChatTranscript, normalizeChatMessages } from "~/lib/chat-message-records";
import { useWebChat, type ChatMessageRecord } from "~/lib/web-chat-context";

export function ChatHeaderActions({
  conversationId,
  title,
}: {
  conversationId: string;
  title: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeConversationId, cancelStream, isStreaming } = useWebChat();
  const { data: messagesData } = useQuery(conversationMessagesQueryOptions(conversationId));
  const rawMessages = useMemo(
    () => (messagesData as { items?: ChatMessageRecord[] } | undefined)?.items ?? [],
    [messagesData],
  );
  const messages = useMemo(() => normalizeChatMessages(rawMessages), [rawMessages]);
  const transcript = useMemo(() => buildChatTranscript(title, messages), [messages, title]);

  const deleteConversation = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/conversations/{id}", {
        params: { path: { id: conversationId } },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      if (isStreaming && activeConversationId === conversationId) cancelStream();
      await navigate({ to: "/chat" });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({
        queryKey: ["conversations", conversationId, "messages"],
        exact: true,
      });
      toast.success("Conversation deleted");
    },
    onError: () => toast.error("Could not delete the conversation"),
  });

  return (
    <div data-testid="chat-header-actions">
      <ChatConversationActions
        title={title}
        transcript={transcript}
        deleting={deleteConversation.isPending}
        onDelete={() => deleteConversation.mutate()}
      />
    </div>
  );
}
