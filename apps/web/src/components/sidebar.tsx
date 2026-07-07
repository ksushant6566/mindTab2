import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
    Box,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    FileText,
    Folder,
    LogOut,
    MessageSquare,
    PencilLine,
    Pin,
    Search,
    Settings,
    Shield,
    UserCircle,
} from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
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

function SectionButton({
    children,
    open,
    onClick,
}: {
    children: React.ReactNode;
    open: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-8 w-full items-center justify-between rounded-[var(--r-2)] px-2 text-sm text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
        >
            <span>{children}</span>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
    );
}

function SidebarAction({
    icon,
    label,
    collapsed,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    collapsed: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            title={collapsed ? label : undefined}
            aria-label={label}
            onClick={onClick}
            className={cn(
                "flex h-8 w-full items-center rounded-[var(--r-3)] text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                collapsed ? "justify-center px-0" : "gap-3 px-2"
            )}
        >
            {icon}
            {!collapsed && <span className="truncate">{label}</span>}
        </button>
    );
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
            <div key={project.id} className="space-y-0.5">
                <div className="group flex h-9 items-center rounded-[var(--r-3)] hover:bg-secondary">
                    <button
                        type="button"
                        onClick={() => toggleProject(project.id)}
                        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-l-[var(--r-3)] px-2 text-left text-sm text-muted-foreground hover:text-foreground"
                    >
                        <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{project.name || "Untitled project"}</span>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </span>
                    </button>
                    <button
                        type="button"
                        title={isPinned ? "Unpin project" : "Pin project"}
                        aria-label={isPinned ? "Unpin project" : "Pin project"}
                        onClick={() => togglePinnedProject(project.id)}
                        className="flex h-9 w-8 items-center justify-center rounded-r-[var(--r-3)] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                        <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current text-foreground")} />
                    </button>
                </div>
                {isOpen && (
                    <div className="space-y-0.5">
                        <button
                            type="button"
                            onClick={() => openDashboard(EActiveLayout.Tasks, project.id)}
                            className={cn(
                                "flex h-8 w-full items-center justify-start gap-2 rounded-[var(--r-3)] pl-8 pr-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                                isProjectTaskActive && "bg-secondary text-foreground"
                            )}
                        >
                            <Folder className="h-3.5 w-3.5" />
                            <span className="min-w-0 flex-1 truncate">Tasks</span>
                            <span className="text-sm">{project.taskStats?.total ?? 0}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => openDashboard(EActiveLayout.Notes, project.id)}
                            className={cn(
                                "flex h-8 w-full items-center justify-start gap-2 rounded-[var(--r-3)] pl-8 pr-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                                isProjectNotesActive && "bg-secondary text-foreground"
                            )}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="min-w-0 flex-1 truncate">Notes</span>
                            <span className="text-sm">{project.noteCount ?? 0}</span>
                        </button>
                        {projectConversations.map((conversation) => (
                            <Link
                                key={conversation.id}
                                to="/chat/$conversationId"
                                params={{ conversationId: conversation.id }}
                                className={cn(
                                    "flex h-8 w-full items-center justify-start gap-2 rounded-[var(--r-3)] pl-8 pr-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                                    pathname === `/chat/${conversation.id}` && "bg-secondary text-foreground"
                                )}
                            >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{conversation.title || "Untitled chat"}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const handleLogout = async () => {
        await logout();
        void navigate({ to: "/" });
    };

    const displayName = user?.name || user?.email || "MindTab user";

    return (
        <aside
            className={cn(
                "relative flex h-screen shrink-0 flex-col border-r border-border bg-card/85 backdrop-blur transition-[width] duration-200",
                collapsed ? "w-[64px]" : "w-[300px]"
            )}
        >
            <div className="flex h-14 items-center justify-between gap-2 px-3">
                {collapsed ? (
                    <Link to="/" className="min-w-0 overflow-hidden px-2">
                        <span className="block truncate text-2xl font-light leading-none text-foreground">MindTab</span>
                    </Link>
                ) : (
                    <Link to="/" className="min-w-0 flex-1 overflow-hidden px-2">
                        <span className="block truncate text-2xl font-light leading-none text-foreground">MindTab</span>
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
            </div>

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

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 [scrollbar-gutter:stable]">
                <div className="mt-3 space-y-1">
                    <SidebarAction collapsed={collapsed} icon={<PencilLine className="h-4 w-4" />} label="New chat" onClick={() => void navigate({ to: "/chat" })} />
                    <SidebarAction collapsed={collapsed} icon={<Shield className="h-4 w-4" />} label="Vault" onClick={() => void navigate({ to: "/vault" })} />
                    <SidebarAction collapsed={collapsed} icon={<Search className="h-4 w-4" />} label="Search" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} />
                    <SidebarAction collapsed={collapsed} icon={<CalendarDays className="h-4 w-4" />} label="Calendar" onClick={() => openDashboard(EActiveLayout.Calendar)} />
                </div>

                {!collapsed && (
                    <div className="mt-6 space-y-5">
                        <section>
                            <SectionButton open={pinnedOpen} onClick={() => setPinnedOpen((value) => !value)}>
                                Pinned
                            </SectionButton>
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
                            <SectionButton open={projectsOpen} onClick={() => setProjectsOpen((value) => !value)}>
                                Projects
                            </SectionButton>
                            {projectsOpen && (
                                <div className="mt-1 space-y-1">
                                    {unpinnedProjects.map(renderProjectRow)}
                                </div>
                            )}
                        </section>

                        <section>
                            <SectionButton open={chatsOpen} onClick={() => setChatsOpen((value) => !value)}>
                                Chats
                            </SectionButton>
                            {chatsOpen && (
                                <div className="mt-1 space-y-1">
                                    {generalConversations.slice(0, 8).map((conversation) => (
                                        <Link
                                            key={conversation.id}
                                            to="/chat/$conversationId"
                                            params={{ conversationId: conversation.id }}
                                            className={cn(
                                                "flex h-8 items-center rounded-[var(--r-3)] px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                                                pathname === `/chat/${conversation.id}` && "bg-secondary text-foreground"
                                            )}
                                        >
                                            <span className="min-w-0 flex-1 truncate">{conversation.title || "Untitled chat"}</span>
                                            {(conversation.updated_at || conversation.created_at) && (
                                                <span className="shrink-0 text-sm text-muted-foreground">
                                                    {getCompactTimeAgo(conversation.updated_at || conversation.created_at || "")}
                                                </span>
                                            )}
                                        </Link>
                                    ))}
                                    {generalConversations.length === 0 && (
                                        <div className="px-2 py-3 text-sm leading-5 text-muted-foreground/70">No chats yet.</div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>

            {!collapsed && (
                <div className="border-t border-border">
                    <button
                        type="button"
                        onClick={() => setAccountMenuOpen((value) => !value)}
                        className="flex h-14 w-full min-w-0 items-center gap-3 px-3 text-left hover:bg-secondary"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm text-foreground">
                            {(displayName[0] ?? "M").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-foreground">{displayName}</div>
                        </div>
                    </button>

                    {accountMenuOpen && (
                        <div className="absolute bottom-[64px] left-3 right-3 z-20 overflow-hidden rounded-[var(--r-3)] border border-border bg-popover p-2 text-sm shadow-lg">
                            <div className="flex h-9 items-center border-b border-border px-2 text-muted-foreground">
                                <div className="truncate">{user?.email ?? "Personal account"}</div>
                            </div>
                            <div className="py-1">
                                <button
                                    type="button"
                                    disabled
                                    className="flex h-9 w-full items-center gap-2 rounded-[var(--r-2)] px-2 text-sm text-muted-foreground opacity-60"
                                >
                                    <UserCircle className="h-4 w-4" />
                                    Profile
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAccountMenuOpen(false);
                                        void navigate({ to: "/settings" });
                                    }}
                                    className="flex h-9 w-full items-center gap-2 rounded-[var(--r-2)] px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                                >
                                    <Settings className="h-4 w-4" />
                                    Settings
                                </button>
                            </div>
                            <div className="border-t border-border pt-1">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex h-9 w-full items-center gap-2 rounded-[var(--r-2)] px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Log out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </aside>
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
