import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FolderOpen, Landmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EActiveLayout } from "@mindtab/core";
import {
  conversationsQueryOptions,
  projectsStatsQueryOptions,
  saveQueryOptions,
  type SaveDetail,
} from "~/api/hooks";
import { Inline } from "~/components/layout";
import { ChatHeaderActions } from "~/components/domain/chat/chat-header-actions";
import { Heading } from "~/components/ui/typography";
import { useDashboardNavigation } from "~/lib/dashboard-navigation";

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
  const { activeElement, activeProjectId } = useDashboardNavigation();
  const conversationId = getConversationIdFromPath(pathname);
  const saveId = getSaveIdFromPath(pathname);
  const { data: projectsData } = useQuery(projectsStatsQueryOptions());
  const { data: conversationData } = useQuery({
    ...conversationsQueryOptions({ limit: 50, offset: 0 }),
    enabled: Boolean(conversationId),
  });
  const { data: activeSave } = useQuery({
    ...saveQueryOptions(saveId || "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(saveId),
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
  const page = getPageContext(pathname, activeElement, activeConversation, activeSave);
  const pageLabel = page?.label ?? null;
  const showProjectLabel = Boolean(projectLabel || (pathname === "/" && activeElement !== EActiveLayout.Calendar));
  const Icon = showProjectLabel ? FolderOpen : page?.icon;

  return (
    <Inline gap="sm" className="min-w-0" data-testid="workstation-header-context">
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
      {!showProjectLabel && page?.parent ? (
        <>
          <Link
            to={page.parent.to}
            aria-label={`Back to ${page.parent.label}`}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Heading as="span" variant="panel">
              {page.parent.label}
            </Heading>
          </Link>
          <Heading as="span" variant="panel" className="shrink-0 text-muted-foreground">
            /
          </Heading>
          <Heading as="div" variant="panel" className="truncate" title={pageLabel ?? undefined}>
            {pageLabel}
          </Heading>
        </>
      ) : null}
      {!showProjectLabel && !page?.parent && pageLabel ? (
        <Heading as="div" variant="panel" className="truncate">
          {pageLabel}
        </Heading>
      ) : null}
      {conversationId ? (
        <ChatHeaderActions conversationId={conversationId} title={pageLabel || "Chat"} />
      ) : null}
    </Inline>
  );
}

function getConversationIdFromPath(pathname: string) {
  if (!pathname.startsWith("/chat/")) return null;
  return pathname.split("/")[2] || null;
}

function getSaveIdFromPath(pathname: string) {
  if (!pathname.startsWith("/vault/")) return null;
  return pathname.split("/")[2] || null;
}

function getConversationProjectId(conversation: ConversationRecord | null) {
  return conversation?.projectId ?? conversation?.project_id ?? null;
}

type PageContext = {
  label: string;
  icon?: LucideIcon;
  parent?: { label: string; to: "/vault" };
};

function getPageContext(
  pathname: string,
  activeElement: string,
  conversation: ConversationRecord | null,
  save?: SaveDetail,
): PageContext | null {
  if (pathname === "/") {
    if (activeElement === EActiveLayout.Tasks) return { label: "Tasks", icon: FolderOpen };
    if (activeElement === EActiveLayout.Notes) return { label: "Notes", icon: FolderOpen };
    if (activeElement === EActiveLayout.Calendar) return { label: "Calendar", icon: CalendarDays };
  }

  if (pathname === "/chat") return { label: "New Chat" };
  if (pathname.startsWith("/chat/")) return { label: conversation?.title || "Chat" };
  if (pathname === "/vault") return { label: "Vault", icon: Landmark };
  if (pathname.startsWith("/vault/")) {
    return {
      label: getSaveTitle(save),
      icon: Landmark,
      parent: { label: "Vault", to: "/vault" },
    };
  }
  return null;
}

function getSaveTitle(save?: SaveDetail) {
  if (save?.source_title) return save.source_title;
  if (save?.source_url) {
    try {
      return new URL(save.source_url).hostname.replace(/^www\./, "");
    } catch {
      return save.source_url;
    }
  }
  return "Saved item";
}
