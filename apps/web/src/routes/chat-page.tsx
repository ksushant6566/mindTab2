import { useParams } from "@tanstack/react-router";
import { WebChatPage } from "~/components/chat/web-chat-page";
import { WorkstationShell } from "~/components/workstation-shell";

export function ChatPage() {
    return (
        <WorkstationShell>
            <WebChatPage />
        </WorkstationShell>
    );
}

export function ChatConversationPage() {
    const { conversationId } = useParams({ from: "/chat/$conversationId" });

    return (
        <WorkstationShell>
            <WebChatPage conversationId={conversationId} />
        </WorkstationShell>
    );
}
