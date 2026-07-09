import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FolderOpen, MessageSquare, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
import { conversationsQueryOptions, projectsStatsQueryOptions } from "~/api/hooks";
import { Inline } from "~/components/layout";
import { Heading } from "~/components/ui/typography";

type ProjectRecord = {
  id: string;
  name?: string | null;
};

type ConversationRecord = {
  id: string;
  title?: string | null;
  projectId?: string | null;
  project_id?: string | null;
};

export function WorkstationHeaderProject() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { activeElement, activeProjectId } = useAppStore();
  const conversationId = getConversationIdFromPath(pathname);
  const { data: projectsData } = useQuery(projectsStatsQueryOptions());
  const { data: conversationData } = useQuery({
    ...conversationsQueryOptions({ limit: 50, offset: 0 }),
    enabled: Boolean(conversationId),
  });

  const conversations = useMemo(
    () => ((conversationData as { items?: ConversationRecord[] } | undefined)?.items ?? []),
    [conversationData]
  );

  const activeConversation = useMemo(() => {
    if (!conversationId) return null;
    return conversations.find((conversation) => conversation.id === conversationId) ?? null;
  }, [conversationId, conversations]);

  const contextProjectId = getConversationProjectId(activeConversation) ?? (pathname === "/" && activeElement !== EActiveLayout.Calendar ? activeProjectId : null);

  const activeProject = useMemo(() => {
    if (!contextProjectId) return null;
    return ((projectsData as ProjectRecord[]) ?? []).find((project) => project.id === contextProjectId) ?? null;
  }, [contextProjectId, projectsData]);

  const projectLabel = activeProject?.name || (contextProjectId ? "Selected project" : null);
  const page = getPageContext(pathname, activeElement, activeConversation);
  const pageLabel = page?.label ?? null;
  const showProjectLabel = Boolean(projectLabel || (pathname === "/" && activeElement !== EActiveLayout.Calendar));
  const Icon = showProjectLabel ? FolderOpen : page?.icon;

  return (
    <Inline gap="sm" className="min-w-0">
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      {showProjectLabel ? (
        <Heading as="div" variant="panel" className="truncate">
          {projectLabel || "All projects"}
        </Heading>
      ) : null}
      {showProjectLabel && pageLabel ? (
        <>
          <Heading as="div" variant="panel" className="shrink-0 text-muted-foreground">
            /
          </Heading>
          <Heading as="div" variant="panel" className="truncate">
            {pageLabel}
          </Heading>
        </>
      ) : null}
      {!showProjectLabel && pageLabel ? (
        <Heading as="div" variant="panel" className="truncate">
          {pageLabel}
        </Heading>
      ) : null}
    </Inline>
  );
}

function getConversationIdFromPath(pathname: string) {
  if (!pathname.startsWith("/chat/")) return null;
  return pathname.split("/")[2] || null;
}

function getConversationProjectId(conversation: ConversationRecord | null) {
  return conversation?.projectId ?? conversation?.project_id ?? null;
}

function getPageContext(pathname: string, activeElement: string, conversation: ConversationRecord | null): { label: string; icon: LucideIcon } | null {
  if (pathname === "/") {
    if (activeElement === EActiveLayout.Tasks) return { label: "Tasks", icon: FolderOpen };
    if (activeElement === EActiveLayout.Notes) return { label: "Notes", icon: FolderOpen };
    if (activeElement === EActiveLayout.Calendar) return { label: "Calendar", icon: CalendarDays };
  }

  if (pathname === "/chat") return { label: "New Chat", icon: MessageSquare };
  if (pathname.startsWith("/chat/")) return { label: conversation?.title || "Chat", icon: MessageSquare };
  if (pathname === "/vault" || pathname.startsWith("/vault/")) return { label: "Vault", icon: Shield };
  return null;
}
