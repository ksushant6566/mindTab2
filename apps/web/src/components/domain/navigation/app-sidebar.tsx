import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
    CalendarDays,
    Command,
    Landmark,
    LogOut,
    PencilLine,
    Search,
    Settings,
    UserCircle,
} from "lucide-react";
import { EActiveLayout } from "@mindtab/core";
import {
    SidebarActionButton,
    SidebarAccountItem,
    SidebarAccountMenu,
    SidebarAccountPopover,
    SidebarAccountPopoverHeader,
    SidebarContent,
    SidebarGeneralChatLink,
    SidebarHeader,
    SidebarItem,
    SidebarLogo,
    SidebarShell,
    SidebarProjectGroup,
    SidebarSectionButton,
} from "~/components/domain/navigation";
import { conversationsQueryOptions, projectsStatsQueryOptions } from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { SIDEBAR_STORAGE_KEY, useWorkstationNavigation } from "~/lib/workstation-navigation";
import { useDashboardNavigation } from "~/lib/dashboard-navigation";

type ProjectRecord = {
    id: string;
    name?: string | null;
    taskStats?: { total?: number | null } | null;
    noteCount?: number | null;
};

type ConversationRecord = {
    id: string;
    title?: string | null;
    projectId?: string | null;
    project_id?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
};

type SidebarStorage = {
    pinnedProjectId?: string | null;
    pinnedProjectIds?: string[];
    pinnedOpen?: boolean;
    projectsOpen?: boolean;
    chatsOpen?: boolean;
    expandedProjectIds?: string[];
};

function readSidebarStorage(): SidebarStorage {
    if (typeof window === "undefined") return {};
    try {
        return JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

export function AppSidebar() {
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const { user, logout } = useAuth();
    const {
        holdSidebarPreviewOpen,
        isSidebarPinned,
        isSidebarPreviewVisible,
        releaseSidebarPreviewHold,
    } = useWorkstationNavigation();
    const { activeElement, activeProjectId, openDashboard } = useDashboardNavigation();
    const initialStorage = useMemo(() => readSidebarStorage(), []);
    const [pinnedProjectIds, setPinnedProjectIds] = useState<Set<string>>(
        () => new Set(initialStorage.pinnedProjectIds ?? (initialStorage.pinnedProjectId ? [initialStorage.pinnedProjectId] : []))
    );
    const [pinnedOpen, setPinnedOpen] = useState(initialStorage.pinnedOpen ?? true);
    const [projectsOpen, setProjectsOpen] = useState(initialStorage.projectsOpen ?? true);
    const [chatsOpen, setChatsOpen] = useState(initialStorage.chatsOpen ?? true);
    const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
        () => new Set(initialStorage.expandedProjectIds ?? [])
    );
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);

    const { data: projectsData } = useQuery(projectsStatsQueryOptions());
    const { data: conversationData } = useQuery(conversationsQueryOptions({ limit: 24, offset: 0 }));

    const projects = ((projectsData as ProjectRecord[]) ?? []).filter((project) => project.id);
    const pinnedProjects = projects.filter((project) => pinnedProjectIds.has(project.id));
    const unpinnedProjects = projects.filter((project) => !pinnedProjectIds.has(project.id));
    const conversations = ((conversationData as { items?: ConversationRecord[] })?.items ?? []);
    const generalConversations = conversations.filter((conversation) => !getConversationProjectId(conversation));

    useEffect(() => {
        const nextStorage: SidebarStorage = {
            pinnedProjectIds: Array.from(pinnedProjectIds),
            pinnedOpen,
            projectsOpen,
            chatsOpen,
            expandedProjectIds: Array.from(expandedProjectIds),
        };
        window.localStorage.setItem(
            SIDEBAR_STORAGE_KEY,
            JSON.stringify({ ...readSidebarStorage(), ...nextStorage })
        );
    }, [chatsOpen, expandedProjectIds, pinnedOpen, pinnedProjectIds, projectsOpen]);

    useEffect(() => {
        if (isSidebarPinned || isSidebarPreviewVisible) return;
        releaseSidebarPreviewHold();
        setAccountMenuOpen(false);
    }, [isSidebarPinned, isSidebarPreviewVisible, releaseSidebarPreviewHold]);

    const toggleProject = (projectId: string) => {
        setExpandedProjectIds((current) => {
            const next = new Set(current);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const togglePinnedProject = (projectId: string) => {
        setPinnedProjectIds((current) => {
            const next = new Set(current);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const getProjectConversations = (projectId: string) => {
        return conversations.filter((conversation) => getConversationProjectId(conversation) === projectId);
    };

    const renderProjectRow = (project: ProjectRecord) => {
        const isOpen = expandedProjectIds.has(project.id);
        const isPinned = pinnedProjectIds.has(project.id);
        const projectConversations = getProjectConversations(project.id);
        const isProjectTaskActive = pathname === "/" && activeProjectId === project.id && activeElement === EActiveLayout.Tasks;
        const isProjectNotesActive = pathname === "/" && activeProjectId === project.id && activeElement === EActiveLayout.Notes;

        return (
            <SidebarProjectGroup
                key={project.id}
                id={project.id}
                name={project.name}
                taskCount={project.taskStats?.total ?? 0}
                noteCount={project.noteCount ?? 0}
                conversations={projectConversations}
                open={isOpen}
                pinned={isPinned}
                taskActive={isProjectTaskActive}
                notesActive={isProjectNotesActive}
                activeConversationPath={pathname}
                onToggle={() => toggleProject(project.id)}
                onTogglePinned={() => togglePinnedProject(project.id)}
                onOpenTasks={() => openDashboard(EActiveLayout.Tasks, project.id)}
                onOpenNotes={() => openDashboard(EActiveLayout.Notes, project.id)}
            />
        );
    };

    const handleLogout = async () => {
        releaseSidebarPreviewHold();
        await logout();
        void navigate({ to: "/" });
    };

    const toggleAccountMenu = () => {
        if (accountMenuOpen) releaseSidebarPreviewHold();
        else holdSidebarPreviewOpen();
        setAccountMenuOpen(!accountMenuOpen);
    };

    const closeAccountMenu = () => {
        releaseSidebarPreviewHold();
        setAccountMenuOpen(false);
    };

    return (
        <SidebarShell data-testid="workstation-sidebar" className="h-screen w-[300px] shrink-0 pt-14">
            <SidebarHeader className="pl-5">
                <Link to="/" search={{ view: "tasks" }} className="min-w-0 flex-1 overflow-hidden">
                    <SidebarLogo className="h-auto px-0">MindTab</SidebarLogo>
                </Link>
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                aria-label="Search"
                                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" sideOffset={8} className="flex items-center gap-3 px-3 py-1.5">
                            <span>Search</span>
                            <kbd className="inline-flex items-center gap-1 rounded-[var(--r-pill)] bg-secondary px-2 py-0.5 font-mono text-[length:var(--type-code-size)] text-muted-foreground">
                                <Command className="h-3 w-3" aria-hidden="true" />
                                K
                            </kbd>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </SidebarHeader>

            <SidebarContent className="custom-scrollbar px-3 pb-4 pt-0">
                <div className="mt-3 space-y-1">
                    <SidebarActionButton icon={<PencilLine className="h-4 w-4" />} label="New chat" onClick={() => void navigate({ to: "/chat" })} />
                    <SidebarActionButton icon={<Landmark className="h-4 w-4" />} label="Vault" onClick={() => void navigate({ to: "/vault" })} />
                    <SidebarActionButton icon={<CalendarDays className="h-4 w-4" />} label="Calendar" onClick={() => openDashboard(EActiveLayout.Calendar, null)} />
                </div>

                <div className="mt-4 space-y-4">
                        <section>
                            <SidebarSectionButton open={pinnedOpen} onClick={() => setPinnedOpen((value) => !value)}>
                                Pinned
                            </SidebarSectionButton>
                            {pinnedOpen && (
                                <div className="mt-1 space-y-1">
                                    {pinnedProjects.map(renderProjectRow)}
                                    {pinnedProjects.length === 0 && (
                                        <div className="px-2 py-3 text-sm leading-5 text-muted-foreground/70">No pinned projects.</div>
                                    )}
                                </div>
                            )}
                        </section>

                        <section>
                            <SidebarSectionButton open={projectsOpen} onClick={() => setProjectsOpen((value) => !value)}>
                                Projects
                            </SidebarSectionButton>
                            {projectsOpen && (
                                <div className="mt-1 space-y-1">
                                    {unpinnedProjects.map(renderProjectRow)}
                                </div>
                            )}
                        </section>

                        <section>
                            <SidebarSectionButton open={chatsOpen} onClick={() => setChatsOpen((value) => !value)}>
                                Chats
                            </SidebarSectionButton>
                            {chatsOpen && (
                                <div className="mt-1 space-y-1">
                                    {generalConversations.slice(0, 8).map((conversation) => (
                                        <SidebarGeneralChatLink
                                            key={conversation.id}
                                            id={conversation.id}
                                            title={conversation.title}
                                            active={pathname === `/chat/${conversation.id}`}
                                            time={
                                                conversation.updated_at || conversation.created_at
                                                    ? getCompactTimeAgo(conversation.updated_at || conversation.created_at || "")
                                                    : undefined
                                            }
                                        />
                                    ))}
                                    {generalConversations.length === 0 && (
                                        <div className="px-2 py-3 text-sm leading-5 text-muted-foreground/70">No chats yet.</div>
                                    )}
                                </div>
                            )}
                        </section>
                </div>
            </SidebarContent>

            <SidebarAccountMenu>
                    <SidebarAccountItem user={user} onClick={toggleAccountMenu} />

                    {accountMenuOpen && (
                        <SidebarAccountPopover>
                            <SidebarAccountPopoverHeader>
                                <div className="truncate">{user?.email ?? "Personal account"}</div>
                            </SidebarAccountPopoverHeader>
                            <div className="py-1">
                                <SidebarItem
                                    onClick={() => {
                                        closeAccountMenu();
                                        void navigate({ to: "/settings", search: { section: "profile" } });
                                    }}
                                    icon={<UserCircle className="h-4 w-4" />}
                                    className="h-9 px-2"
                                >
                                    Profile
                                </SidebarItem>
                                <SidebarItem
                                    onClick={() => {
                                        closeAccountMenu();
                                        void navigate({ to: "/settings", search: { section: "general" } });
                                    }}
                                    icon={<Settings className="h-4 w-4" />}
                                    className="h-9 px-2"
                                >
                                    Settings
                                </SidebarItem>
                            </div>
                            <div className="border-t border-border pt-1">
                                <SidebarItem
                                    onClick={handleLogout}
                                    icon={<LogOut className="h-4 w-4" />}
                                    className="h-9 px-2"
                                >
                                    Log out
                                </SidebarItem>
                            </div>
                        </SidebarAccountPopover>
                    )}
            </SidebarAccountMenu>
        </SidebarShell>
    );
}

function getConversationProjectId(conversation: ConversationRecord) {
    return conversation.projectId ?? conversation.project_id ?? null;
}

function getCompactTimeAgo(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "";

    const diffMs = Math.max(Date.now() - timestamp, 0);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diffMs < minute) return "now";
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
    if (diffMs < week) return `${Math.floor(diffMs / day)}d`;
    if (diffMs < month) return `${Math.floor(diffMs / week)}w`;
    if (diffMs < year) return `${Math.floor(diffMs / month)}mo`;
    return `${Math.floor(diffMs / year)}y`;
}
