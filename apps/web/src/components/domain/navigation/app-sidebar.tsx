import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
    CalendarDays,
    ChevronsLeft,
    ChevronsRight,
    LogOut,
    PencilLine,
    Search,
    Settings,
    Shield,
    UserCircle,
} from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
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
import { Button } from "~/components/ui/button";
import { conversationsQueryOptions, projectsStatsQueryOptions } from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { cn } from "~/lib/utils";

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

const SIDEBAR_STORAGE_KEY = "mindtab-sidebar";

type SidebarStorage = {
    collapsed?: boolean;
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
    const { activeElement, activeProjectId, setActiveElement, setActiveProjectId } = useAppStore();
    const initialStorage = useMemo(() => readSidebarStorage(), []);
    const [collapsed, setCollapsed] = useState(Boolean(initialStorage.collapsed));
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
            collapsed,
            pinnedProjectIds: Array.from(pinnedProjectIds),
            pinnedOpen,
            projectsOpen,
            chatsOpen,
            expandedProjectIds: Array.from(expandedProjectIds),
        };
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(nextStorage));
    }, [chatsOpen, collapsed, expandedProjectIds, pinnedOpen, pinnedProjectIds, projectsOpen]);

    useEffect(() => {
        if (collapsed) setAccountMenuOpen(false);
    }, [collapsed]);

    const openDashboard = (element: typeof EActiveLayout[keyof typeof EActiveLayout], projectId: string | null = activeProjectId) => {
        setActiveProjectId(projectId);
        setActiveElement(element);
        void navigate({ to: "/" });
    };

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
        await logout();
        void navigate({ to: "/" });
    };

    return (
        <SidebarShell
            className={cn(
                "relative h-screen shrink-0 transition-[width] duration-200",
                collapsed ? "w-[64px]" : "w-[300px]"
            )}
        >
            <SidebarHeader>
                {collapsed ? (
                    <Link to="/" className="min-w-0 overflow-hidden">
                        <SidebarLogo className="h-auto px-2">MindTab</SidebarLogo>
                    </Link>
                ) : (
                    <Link to="/" className="min-w-0 flex-1 overflow-hidden">
                        <SidebarLogo className="h-auto px-2">MindTab</SidebarLogo>
                    </Link>
                )}
                {!collapsed && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Collapse sidebar"
                        aria-label="Collapse sidebar"
                        onClick={() => setCollapsed(true)}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                )}
            </SidebarHeader>

            {collapsed && (
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-[-14px] top-4 z-20 h-7 w-7 rounded-full bg-card shadow-sm"
                    title="Expand sidebar"
                    aria-label="Expand sidebar"
                    onClick={() => setCollapsed(false)}
                >
                    <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
            )}

            <SidebarContent className="custom-scrollbar px-3 pb-4 pt-0">
                <div className="mt-3 space-y-1">
                    <SidebarActionButton collapsed={collapsed} icon={<PencilLine className="h-4 w-4" />} label="New chat" onClick={() => void navigate({ to: "/chat" })} />
                    <SidebarActionButton collapsed={collapsed} icon={<Shield className="h-4 w-4" />} label="Vault" onClick={() => void navigate({ to: "/vault" })} />
                    <SidebarActionButton collapsed={collapsed} icon={<Search className="h-4 w-4" />} label="Search" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} />
                    <SidebarActionButton collapsed={collapsed} icon={<CalendarDays className="h-4 w-4" />} label="Calendar" onClick={() => openDashboard(EActiveLayout.Calendar)} />
                </div>

                {!collapsed && (
                    <div className="mt-6 space-y-5">
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
                )}
            </SidebarContent>

            {!collapsed && (
                <SidebarAccountMenu>
                    <SidebarAccountItem user={user} onClick={() => setAccountMenuOpen((value) => !value)} />

                    {accountMenuOpen && (
                        <SidebarAccountPopover>
                            <SidebarAccountPopoverHeader>
                                <div className="truncate">{user?.email ?? "Personal account"}</div>
                            </SidebarAccountPopoverHeader>
                            <div className="py-1">
                                <SidebarItem
                                    onClick={() => {
                                        setAccountMenuOpen(false);
                                        void navigate({ to: "/settings", search: { section: "profile" } });
                                    }}
                                    icon={<UserCircle className="h-4 w-4" />}
                                    className="h-9 px-2"
                                >
                                    Profile
                                </SidebarItem>
                                <SidebarItem
                                    onClick={() => {
                                        setAccountMenuOpen(false);
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
            )}
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
