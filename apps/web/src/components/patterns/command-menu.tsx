import {
    ArrowLeft,
    CalendarDays,
    Check,
    ChevronRight,
    Command,
    FileText,
    FolderKanban,
    FolderPlus,
    Keyboard,
    Landmark,
    ListTodo,
    LoaderCircle,
    LogOut,
    type LucideIcon,
    MessageSquare,
    NotebookPen,
    Palette,
    Plus,
    Search,
    Settings,
    Sparkles,
    UserCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EActiveLayout } from "@mindtab/core";
import { toast } from "sonner";
import {
    conversationsQueryOptions,
    notesQueryOptions,
    projectsStatsQueryOptions,
    savesQueryOptions,
    tasksQueryOptions,
    useCreateProject,
    useCreateTask,
    useUpdateTask,
} from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { CreateNoteDialog } from "~/components/notes/create-note-dialog";
import { NoteDialog } from "~/components/notes/note-dialog";
import { CreateProjectDialog } from "~/components/projects/create-project-dialog";
import { TaskDialog, type TaskDialogInput } from "~/components/tasks/task-dialog";
import { getScheduleDraftPayload } from "~/components/tasks/task-schedule-fields";
import { Button } from "~/components/ui/button";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from "~/components/ui/command";
import { CodeText, MetaText, Text } from "~/components/ui/typography";
import { useDashboardNavigation } from "~/lib/dashboard-navigation";
import {
    getCommandSearchQuery,
    rankCommandItems,
    type CommandSearchKind,
} from "~/lib/command-search";
import { cn } from "~/lib/utils";

type ProjectRecord = {
    id: string;
    name?: string | null;
    description?: string | null;
    noteCount?: number | null;
    taskStats?: { total?: number | null } | null;
};

type ConversationRecord = {
    id: string;
    title?: string | null;
    projectId?: string | null;
    project_id?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
};

type SaveRecord = {
    id: string;
    source_title?: string | null;
    source_url?: string | null;
    source_type?: string | null;
    summary?: string | null;
    tags?: string[] | null;
    created_at?: string | null;
};

type CommandTone = "default" | "task" | "note" | "project" | "calendar" | "settings";

type CommandMenuItem = {
    id: string;
    label: string;
    description?: string;
    aliases?: string[];
    keywords?: string[];
    kind: CommandSearchKind;
    icon: LucideIcon;
    shortcut?: string;
    badge?: string;
    active?: boolean;
    trailing?: "arrow";
    tone?: CommandTone;
    projectId?: string | null;
    timestamp?: string | null;
    matchReason?: string;
    onSelect: () => void;
};

const ROOT_PROJECT_LIMIT = 6;
const ROOT_RECENT_LIMIT = 5;
export const CommandMenu = () => {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { activeProjectId, openDashboard } = useDashboardNavigation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
    const [dialogProjectId, setDialogProjectId] = useState<string | null>(null);
    const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
    const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
    const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
    const [currentNote, setCurrentNote] = useState<any | null>(null);
    const [isNoteOpen, setIsNoteOpen] = useState(false);
    const [currentTask, setCurrentTask] = useState<any | null>(null);
    const [isTaskOpen, setIsTaskOpen] = useState(false);
    const hasQuery = query.trim().length > 0;

    const { data: projectsData, isFetching: isFetchingProjects } = useQuery({
        ...projectsStatsQueryOptions(),
        enabled: open,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
    const { data: conversationsData, isFetching: isFetchingConversations } = useQuery({
        ...conversationsQueryOptions({ limit: 50, offset: 0 }),
        enabled: open,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
    const { data: savesData, isFetching: isFetchingSaves } = useQuery({
        ...savesQueryOptions({ limit: 100, offset: 0 }),
        enabled: open,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
    const { data: tasksData, isFetching: isFetchingTasks } = useQuery({
        ...tasksQueryOptions(),
        enabled: open,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
    const { data: notesData, isFetching: isFetchingNotes } = useQuery({
        ...notesQueryOptions(),
        enabled: open,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const projects = useMemo(
        () => ((projectsData as ProjectRecord[]) ?? []).filter((project) => project.id),
        [projectsData],
    );
    const conversations = useMemo(
        () => ((conversationsData as { items?: ConversationRecord[] })?.items ?? []).filter((conversation) => conversation.id),
        [conversationsData],
    );
    const saves = useMemo(
        () => ((savesData as SaveRecord[]) ?? []).filter((save) => save.id),
        [savesData],
    );
    const tasks = useMemo(() => (tasksData as any[]) ?? [], [tasksData]);
    const notes = useMemo(() => (notesData as any[]) ?? [], [notesData]);
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

    const createTaskMutation = useCreateTask();
    const updateTaskMutation = useUpdateTask();
    const createProjectMutation = useCreateProject();

    const resetCommandState = useCallback(() => {
        setQuery("");
        setSelectedProject(null);
    }, []);

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) resetCommandState();
    }, [resetCommandState]);

    const closeCommandMenu = useCallback(() => {
        setOpen(false);
        resetCommandState();
    }, [resetCommandState]);

    const runNavigation = useCallback((action: () => void) => {
        closeCommandMenu();
        action();
    }, [closeCommandMenu]);

    const openSettingsSection = useCallback((section: "general" | "profile" | "appearance" | "shortcuts") => {
        runNavigation(() => void navigate({ to: "/settings", search: { section } }));
    }, [navigate, runNavigation]);

    const openCreateTask = useCallback((projectId: string | null = activeProjectId) => {
        setDialogProjectId(projectId);
        closeCommandMenu();
        setIsCreateTaskOpen(true);
    }, [activeProjectId, closeCommandMenu]);

    const openCreateNote = useCallback((projectId: string | null = activeProjectId) => {
        setDialogProjectId(projectId);
        closeCommandMenu();
        setIsCreateNoteOpen(true);
    }, [activeProjectId, closeCommandMenu]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
            event.preventDefault();
            setOpen((current) => {
                const next = !current;
                if (!next) resetCommandState();
                return next;
            });
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [resetCommandState]);

    const createTask = (values: TaskDialogInput & { status?: string; projectId?: string | null }) => {
        const { schedule, ...taskFields } = values;
        const schedulePayload = getScheduleDraftPayload(schedule);
        createTaskMutation.mutate({
            ...taskFields,
            projectId: dialogProjectId,
            ...(schedulePayload ? {
                scheduledStartAt: schedulePayload.startAt.toISOString(),
                scheduledEndAt: schedulePayload.endAt.toISOString(),
            } : {}),
        }, {
            onSuccess: () => toast.success("Task created"),
            onSettled: () => setIsCreateTaskOpen(false),
        });
    };

    const updateTask = (values: any) => {
        const updateKeys = Object.entries(values)
            .filter(([key, value]) => key !== "id" && value !== undefined)
            .map(([key]) => key);
        const isStatusOnlyUpdate = updateKeys.length === 1 && updateKeys[0] === "status";
        updateTaskMutation.mutate(values, {
            onSettled: () => {
                if (!isStatusOnlyUpdate) setIsTaskOpen(false);
            },
        });
    };

    const quickActions = useMemo<CommandMenuItem[]>(() => [
        {
            id: "create-task",
            label: "Create task",
            description: activeProject ? `Add to ${activeProject.name || "current project"}` : "Capture work and set priority, impact, or a schedule",
            aliases: ["new task", "add task", "new todo", "quick task"],
            keywords: ["capture work", "priority", "impact", "schedule"],
            kind: "action",
            icon: Plus,
            tone: "task",
            badge: activeProject ? "Current project" : undefined,
            projectId: activeProjectId,
            onSelect: () => openCreateTask(),
        },
        {
            id: "create-note",
            label: "Create note",
            description: activeProject ? `Add to ${activeProject.name || "current project"}` : "Capture a rich-text note",
            aliases: ["new note", "add note", "write note", "quick note"],
            keywords: ["capture", "write", "document"],
            kind: "action",
            icon: NotebookPen,
            tone: "note",
            badge: activeProject ? "Current project" : undefined,
            projectId: activeProjectId,
            onSelect: () => openCreateNote(),
        },
        {
            id: "create-project",
            label: "Create project",
            description: "Start a focused workspace for tasks, notes, and chats",
            aliases: ["new project", "add project", "new workspace"],
            keywords: ["workspace", "tasks", "notes", "chats"],
            kind: "action",
            icon: FolderPlus,
            tone: "project",
            onSelect: () => {
                closeCommandMenu();
                setIsCreateProjectOpen(true);
            },
        },
        {
            id: "new-chat",
            label: "Start a new chat",
            description: "Ask MindTab about your work and saved material",
            aliases: ["new chat", "create chat", "ask mindtab"],
            keywords: ["ai", "assistant", "conversation", "message"],
            kind: "action",
            icon: Sparkles,
            shortcut: "⇧⌘N",
            onSelect: () => runNavigation(() => void navigate({ to: "/chat" })),
        },
    ], [activeProject, closeCommandMenu, navigate, openCreateNote, openCreateTask, runNavigation]);

    const navigationItems = useMemo<CommandMenuItem[]>(() => [
        {
            id: "open-tasks",
            label: "Tasks",
            description: "Open the task board across all projects",
            aliases: ["open tasks", "task board", "go to tasks"],
            keywords: ["home", "dashboard", "kanban", "todo"],
            kind: "navigation",
            icon: ListTodo,
            tone: "task",
            onSelect: () => runNavigation(() => openDashboard(EActiveLayout.Tasks, null)),
        },
        {
            id: "open-notes",
            label: "Notes",
            description: "Browse notes across all projects",
            aliases: ["open notes", "go to notes", "browse notes"],
            keywords: ["home", "dashboard", "documents"],
            kind: "navigation",
            icon: NotebookPen,
            tone: "note",
            onSelect: () => runNavigation(() => openDashboard(EActiveLayout.Notes, null)),
        },
        {
            id: "open-calendar",
            label: "Calendar",
            description: "Plan scheduled and unscheduled tasks",
            aliases: ["open calendar", "go to calendar", "planner"],
            keywords: ["today", "week", "month", "schedule"],
            kind: "navigation",
            icon: CalendarDays,
            tone: "calendar",
            onSelect: () => runNavigation(() => openDashboard(EActiveLayout.Calendar, null)),
        },
        {
            id: "open-vault",
            label: "Vault",
            description: "Browse saved articles, media, and captured material",
            aliases: ["open vault", "go to vault", "saved items"],
            keywords: ["saves", "bookmarks", "library"],
            kind: "navigation",
            icon: Landmark,
            onSelect: () => runNavigation(() => void navigate({ to: "/vault" })),
        },
    ], [navigate, openDashboard, runNavigation]);

    const settingsItems = useMemo<CommandMenuItem[]>(() => [
        {
            id: "settings-general",
            label: "General settings",
            description: "Time zone, week start, and time format",
            aliases: ["open settings", "preferences", "general preferences"],
            keywords: ["time zone", "week start", "time format"],
            kind: "settings",
            icon: Settings,
            tone: "settings",
            onSelect: () => openSettingsSection("general"),
        },
        {
            id: "settings-profile",
            label: "Profile",
            description: "Account details and activity",
            aliases: ["open profile", "my account"],
            keywords: ["account", "user", "activity"],
            kind: "settings",
            icon: UserCircle,
            tone: "settings",
            onSelect: () => openSettingsSection("profile"),
        },
        {
            id: "settings-appearance",
            label: "Appearance",
            description: "Theme, template, typography, contrast, and radius",
            aliases: ["appearance settings", "theme settings", "customize theme"],
            keywords: ["dark", "light", "font", "theme", "template", "contrast", "radius"],
            kind: "settings",
            icon: Palette,
            tone: "settings",
            onSelect: () => openSettingsSection("appearance"),
        },
        {
            id: "settings-shortcuts",
            label: "Keyboard Shortcuts",
            description: "See every app shortcut",
            aliases: ["shortcuts", "keyboard settings"],
            keywords: ["hotkeys", "keys"],
            kind: "settings",
            icon: Keyboard,
            tone: "settings",
            onSelect: () => openSettingsSection("shortcuts"),
        },
        {
            id: "logout",
            label: "Log out",
            description: "Sign out of this MindTab account",
            aliases: ["sign out", "logout"],
            keywords: ["account"],
            kind: "action",
            icon: LogOut,
            onSelect: () => {
                closeCommandMenu();
                void logout();
            },
        },
    ], [closeCommandMenu, logout, openSettingsSection]);

    const projectItems = useMemo<CommandMenuItem[]>(() => {
        return projects.map((project) => ({
            id: `project-${project.id}`,
            label: project.name || "Untitled project",
            description: project.description || `${project.taskStats?.total ?? 0} tasks · ${project.noteCount ?? 0} notes`,
            aliases: [`open ${project.name || "project"}`],
            keywords: ["project", "workspace", "tasks", "notes", project.description ?? ""],
            kind: "project",
            icon: FolderKanban,
            tone: "project",
            badge: `${project.taskStats?.total ?? 0} tasks`,
            projectId: project.id,
            trailing: "arrow",
            onSelect: () => {
                setSelectedProject(project);
                setQuery("");
            },
        }));
    }, [projects]);

    const chatItems = useMemo<CommandMenuItem[]>(() => {
        return conversations.map((conversation) => ({
            id: `chat-${conversation.id}`,
            label: conversation.title || "Untitled chat",
            description: conversation.projectId || conversation.project_id ? "Project conversation" : "Recent conversation",
            keywords: ["chat", "conversation", "assistant"],
            kind: "chat",
            icon: MessageSquare,
            badge: "Chat",
            projectId: conversation.projectId || conversation.project_id,
            timestamp: conversation.updated_at || conversation.created_at,
            onSelect: () => runNavigation(() => void navigate({
                to: "/chat/$conversationId",
                params: { conversationId: conversation.id },
            })),
        }));
    }, [conversations, navigate, runNavigation]);

    const saveItems = useMemo<CommandMenuItem[]>(() => {
        return saves.map((save) => ({
            id: `save-${save.id}`,
            label: save.source_title || save.source_url || "Untitled save",
            description: save.summary || formatSourceType(save.source_type),
            keywords: ["vault", "save", "bookmark", formatSourceType(save.source_type), save.source_url ?? "", ...(save.tags ?? [])],
            kind: "vault",
            icon: FileText,
            badge: `Vault · ${formatSourceType(save.source_type)}`,
            timestamp: save.created_at,
            onSelect: () => runNavigation(() => void navigate({
                to: "/vault/$saveId",
                params: { saveId: save.id },
            })),
        }));
    }, [navigate, runNavigation, saves]);

    const taskItems = useMemo<CommandMenuItem[]>(() => tasks.map((task) => ({
        id: `task-${task.id}`,
        label: task.title || "Untitled task",
        description: [task.projectName, formatTaskStatus(task.status), truncatePlainText(task.description, 90)].filter(Boolean).join(" · ") || "Task",
        keywords: ["task", task.status, task.priority, task.impact, task.projectName, task.description].filter(Boolean),
        kind: "task",
        icon: ListTodo,
        tone: "task",
        badge: `Task · ${formatTaskStatus(task.status)}`,
        projectId: task.projectId,
        timestamp: task.updatedAt || task.createdAt,
        onSelect: () => {
            setCurrentTask(task);
            closeCommandMenu();
            setIsTaskOpen(true);
        },
    })), [closeCommandMenu, tasks]);

    const noteItems = useMemo<CommandMenuItem[]>(() => notes.map((note) => ({
        id: `note-${note.id}`,
        label: note.title || "Untitled note",
        description: [note.projectName, truncatePlainText(note.content, 110)].filter(Boolean).join(" · ") || "Note",
        keywords: ["note", "document", note.projectName, truncatePlainText(note.content, 600)].filter(Boolean),
        kind: "note",
        icon: FileText,
        tone: "note",
        badge: "Note",
        projectId: note.projectId,
        timestamp: note.updatedAt || note.createdAt,
        onSelect: () => {
            setCurrentNote(note);
            closeCommandMenu();
            setIsNoteOpen(true);
        },
    })), [closeCommandMenu, notes]);

    const projectActionItems = useMemo<CommandMenuItem[]>(() => selectedProject ? [
        {
            id: "project-open-tasks",
            label: "Open project tasks",
            description: `Show the task board for ${selectedProject.name || "this project"}`,
            aliases: ["tasks", "task board", "open tasks"],
            keywords: [selectedProject.name ?? "", "project"],
            kind: "navigation",
            icon: ListTodo,
            tone: "task",
            projectId: selectedProject.id,
            onSelect: () => runNavigation(() => openDashboard(EActiveLayout.Tasks, selectedProject.id)),
        },
        {
            id: "project-open-notes",
            label: "Open project notes",
            description: `Browse notes for ${selectedProject.name || "this project"}`,
            aliases: ["notes", "open notes", "browse notes"],
            keywords: [selectedProject.name ?? "", "project"],
            kind: "navigation",
            icon: NotebookPen,
            tone: "note",
            projectId: selectedProject.id,
            onSelect: () => runNavigation(() => openDashboard(EActiveLayout.Notes, selectedProject.id)),
        },
        {
            id: "project-create-task",
            label: "Create task in project",
            description: `Add a task to ${selectedProject.name || "this project"}`,
            aliases: ["new task", "add task", "create task"],
            keywords: [selectedProject.name ?? "", "project"],
            kind: "action",
            icon: Plus,
            tone: "task",
            projectId: selectedProject.id,
            onSelect: () => openCreateTask(selectedProject.id),
        },
        {
            id: "project-create-note",
            label: "Create note in project",
            description: `Add a note to ${selectedProject.name || "this project"}`,
            aliases: ["new note", "add note", "create note"],
            keywords: [selectedProject.name ?? "", "project"],
            kind: "action",
            icon: NotebookPen,
            tone: "note",
            projectId: selectedProject.id,
            onSelect: () => openCreateNote(selectedProject.id),
        },
    ] : [], [openCreateNote, openCreateTask, openDashboard, runNavigation, selectedProject]);

    const allSearchItems = useMemo(
        () => [
            ...quickActions,
            ...navigationItems,
            ...taskItems,
            ...noteItems,
            ...projectItems,
            ...chatItems,
            ...saveItems,
            ...settingsItems,
        ],
        [chatItems, navigationItems, noteItems, projectItems, quickActions, saveItems, settingsItems, taskItems],
    );
    const rankedSearchItems = useMemo(
        () => rankCommandItems(allSearchItems, query, { activeProjectId, limit: 20 }).map((result) => ({
            ...result.item,
            matchReason: result.reason,
        })),
        [activeProjectId, allSearchItems, query],
    );
    const rankedProjectActionItems = useMemo(
        () => hasQuery
            ? rankCommandItems(projectActionItems, query, { activeProjectId: selectedProject?.id, limit: 8 }).map((result) => ({
                ...result.item,
                matchReason: result.reason,
            }))
            : projectActionItems,
        [hasQuery, projectActionItems, query, selectedProject?.id],
    );
    const isFetchingSearch = open && (
        isFetchingProjects
        || isFetchingConversations
        || isFetchingSaves
        || isFetchingTasks
        || isFetchingNotes
    );
    const highlightedQuery = getCommandSearchQuery(query);

    return (
        <>
            <Button
                size="sm"
                variant="outline"
                className="command-trigger-shimmer h-9 w-72 justify-between gap-3 px-3 text-muted-foreground"
                style={{
                    backgroundImage: "linear-gradient(110deg, var(--command-shimmer-from), 45%, var(--command-shimmer-to), 55%, var(--command-shimmer-from))",
                    backgroundSize: "200% 100%",
                }}
                onClick={() => handleOpenChange(true)}
                aria-label="Open command menu (⌘K)"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <Text as="span" variant="muted" className="truncate">Search or run a command</Text>
                </span>
                <CodeText as="kbd" className="inline-flex items-center gap-1 rounded-[var(--r-1)] border border-border bg-background/70 px-1.5 py-0.5">
                    <Command className="h-3 w-3" aria-hidden="true" />
                    K
                </CodeText>
            </Button>

            <CommandDialog
                open={open}
                onOpenChange={handleOpenChange}
                title="MindTab command center"
                description="Search content, navigate, or run an action"
                shouldFilter={false}
                loop
                onEscapeKeyDown={(event) => {
                    if (!selectedProject) return;
                    event.preventDefault();
                    setSelectedProject(null);
                    setQuery("");
                }}
            >
                <CommandInput
                    placeholder={selectedProject ? `Search actions for ${selectedProject.name || "project"}...` : "Search tasks, notes, projects, chats, saves, and commands..."}
                    value={query}
                    onValueChange={setQuery}
                />
                <CommandList>
                    <CommandEmpty>
                        {isFetchingSearch ? (
                            <span className="inline-flex items-center gap-2">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                Searching MindTab…
                            </span>
                        ) : (
                            <span>No results matched “{query}”. Try fewer words or a filter like task: or note:.</span>
                        )}
                    </CommandEmpty>

                    {selectedProject ? (
                        <>
                            <CommandMenuGroup
                                heading={selectedProject.name || "Project"}
                                items={[{
                                    id: "project-back",
                                    label: "Back to all commands",
                                    description: "Return to the command center",
                                    kind: "navigation",
                                    icon: ArrowLeft,
                                    shortcut: "Esc",
                                    onSelect: () => {
                                        setSelectedProject(null);
                                        setQuery("");
                                    },
                                }]}
                            />
                            <CommandMenuGroup heading="Project actions" items={rankedProjectActionItems} query={highlightedQuery} />
                        </>
                    ) : hasQuery ? (
                        <CommandMenuGroup
                            heading={`Best matches · ${rankedSearchItems.length}`}
                            items={rankedSearchItems}
                            query={highlightedQuery}
                        />
                    ) : (
                        <>
                            <CommandMenuGroup heading="Quick actions" items={quickActions} />
                            <CommandMenuGroup heading="Go to" items={navigationItems} />
                            <CommandMenuGroup heading="Projects" items={projectItems.slice(0, ROOT_PROJECT_LIMIT)} />
                            <CommandMenuGroup heading="Recent chats" items={chatItems.slice(0, ROOT_RECENT_LIMIT)} />
                            <CommandMenuGroup heading="Vault" items={saveItems.slice(0, ROOT_RECENT_LIMIT)} />
                            <CommandMenuGroup heading="Settings" items={settingsItems} />
                        </>
                    )}
                </CommandList>
                <CommandMenuFooter
                    searching={isFetchingSearch}
                    query={query}
                    resultCount={selectedProject ? rankedProjectActionItems.length : rankedSearchItems.length}
                />
            </CommandDialog>

            <CreateNoteDialog
                isOpen={isCreateNoteOpen}
                onOpenChange={(nextOpen) => {
                    setIsCreateNoteOpen(nextOpen);
                    if (!nextOpen) setDialogProjectId(null);
                }}
                activeProjectId={dialogProjectId}
            />
            <NoteDialog
                isOpen={isNoteOpen}
                onOpenChange={(nextOpen) => {
                    setIsNoteOpen(nextOpen);
                    if (!nextOpen) setCurrentNote(null);
                }}
                defaultMode="view"
                note={currentNote}
            />
            <TaskDialog
                mode="create"
                open={isCreateTaskOpen}
                onOpenChange={(nextOpen) => {
                    setIsCreateTaskOpen(nextOpen);
                    if (!nextOpen) setDialogProjectId(null);
                }}
                defaultValues={{ status: "pending", projectId: dialogProjectId }}
                onCreate={(task) => createTask({ ...task, status: "pending", projectId: dialogProjectId })}
                isSaving={createTaskMutation.isPending}
            />
            {currentTask && (
                <TaskDialog
                    mode="edit"
                    open={isTaskOpen}
                    onOpenChange={(nextOpen) => {
                        setIsTaskOpen(nextOpen);
                        if (!nextOpen) setCurrentTask(null);
                    }}
                    task={currentTask}
                    onUpdate={(_taskId, values) => updateTask({ ...values, id: currentTask.id })}
                    isSaving={updateTaskMutation.isPending}
                />
            )}
            <CreateProjectDialog
                open={isCreateProjectOpen}
                onOpenChange={setIsCreateProjectOpen}
                onCancel={() => setIsCreateProjectOpen(false)}
                onSave={async (project) => {
                    try {
                        const createdProject = await createProjectMutation.mutateAsync(project);
                        setIsCreateProjectOpen(false);
                        toast.success("Project created");
                        if ((createdProject as any)?.id) {
                            openDashboard(EActiveLayout.Tasks, (createdProject as any).id);
                        }
                    } catch (error: any) {
                        toast.error(error?.message || "Failed to create project");
                        throw error;
                    }
                }}
            />
        </>
    );
};

function CommandMenuGroup({ heading, items, query = "" }: { heading: string; items: CommandMenuItem[]; query?: string }) {
    if (items.length === 0) return null;

    return (
        <CommandGroup heading={heading}>
            {items.map((item) => {
                const Icon = item.icon;
                const searchableValue = [item.label, item.description, ...(item.keywords ?? [])].filter(Boolean).join(" ");
                return (
                    <CommandItem key={item.id} onSelect={item.onSelect} value={searchableValue}>
                        <span className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-[var(--r-2)] border border-border bg-background text-muted-foreground transition-colors",
                            commandToneClasses[item.tone ?? "default"],
                            "group-data-[selected=true]:border-[var(--border-2)] group-data-[selected=true]:bg-[var(--bg-elev)]",
                        )}>
                            <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <Text as="span" className="block truncate">
                                <HighlightedText text={item.label} query={query} />
                            </Text>
                            {item.description && (
                                <MetaText as="span" className="block truncate">
                                    <HighlightedText text={item.description} query={query} />
                                </MetaText>
                            )}
                        </span>
                        {item.matchReason && query && (
                            <MetaText as="span" className="hidden rounded-[var(--r-pill)] bg-[var(--bg-soft)] px-2 py-0.5 lg:inline">
                                {item.matchReason}
                            </MetaText>
                        )}
                        {item.badge && (
                            <MetaText as="span" className="hidden max-w-32 truncate rounded-[var(--r-pill)] border border-border bg-background px-2 py-0.5 sm:inline">
                                {item.badge}
                            </MetaText>
                        )}
                        {item.active ? (
                            <CommandShortcut className="inline-flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Active
                            </CommandShortcut>
                        ) : item.shortcut ? (
                            <CommandShortcut>{item.shortcut}</CommandShortcut>
                        ) : item.trailing === "arrow" ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : null}
                    </CommandItem>
                );
            })}
        </CommandGroup>
    );
}

function CommandMenuFooter({ searching, query, resultCount }: { searching: boolean; query: string; resultCount: number }) {
    const status = searching
        ? "Refreshing your workspace index"
        : query.trim()
            ? `Showing ${resultCount} best ${resultCount === 1 ? "match" : "matches"} · relevance, context, and recency`
            : "Search naturally, or narrow with task:, note:, project:, chat:, or vault:";

    return (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-[var(--bg)]/35 px-4 py-2.5">
            <MetaText as="span" className="inline-flex items-center gap-2">
                {searching ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {status}
            </MetaText>
            <span className="hidden items-center gap-3 sm:flex">
                <ShortcutHint keys="↑↓" label="Navigate" />
                <ShortcutHint keys="↵" label="Open" />
                <ShortcutHint keys="Esc" label="Close" />
            </span>
        </div>
    );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
    const terms = [query, ...query.split(" ")]
        .map((term) => term.trim())
        .filter((term, index, values) => term.length >= 2 && values.indexOf(term) === index)
        .sort((left, right) => right.length - left.length);
    if (terms.length === 0) return text;

    const expression = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
    const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));
    return text.split(expression).map((part, index) => normalizedTerms.has(part.toLowerCase()) ? (
        <mark key={`${part}-${index}`} className="rounded-[var(--r-1)] bg-[var(--ink-soft)] text-foreground">
            {part}
        </mark>
    ) : part);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
    return (
        <MetaText as="span" className="inline-flex items-center gap-1.5">
            <CodeText as="kbd" className="rounded-[var(--r-1)] border border-border bg-background px-1.5 py-0.5">{keys}</CodeText>
            {label}
        </MetaText>
    );
}

function formatSourceType(sourceType?: string | null) {
    if (!sourceType) return "Saved item";
    return sourceType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncatePlainText(value: unknown, maximumLength: number) {
    if (typeof value !== "string") return "";
    const text = value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > maximumLength ? `${text.slice(0, maximumLength - 1).trimEnd()}…` : text;
}

function formatTaskStatus(status?: string | null) {
    if (!status) return "Task";
    if (status === "in_progress") return "In progress";
    if (status === "completed") return "Completed";
    if (status === "pending") return "To do";
    return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const commandToneClasses: Record<CommandTone, string> = {
    default: "text-muted-foreground",
    task: "text-[var(--tone-task)]",
    note: "text-[var(--tone-note)]",
    project: "text-[var(--tone-project)]",
    calendar: "text-[var(--tone-calendar-now)]",
    settings: "text-[var(--tone-appearance)]",
};
