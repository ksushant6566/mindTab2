import {
    Check,
    FileText,
    Laptop,
    ListTodo,
    Loader,
    LogOut,
    LucideIcon,
    Moon,
    Notebook,
    PlusIcon,
    Sun,
    Type,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import {
    searchNotesQueryOptions,
    searchTasksQueryOptions,
    useCreateTask,
    useUpdateTask,
} from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { CreateNoteDialog } from "~/components/notes/create-note-dialog";
import { NoteDialog } from "~/components/notes/note-dialog";
import { TaskDialog, type TaskDialogInput } from "~/components/tasks/task-dialog";
import { getScheduleDraftPayload } from "~/components/tasks/task-schedule-fields";
import {
    useAppStore,
    type AppearanceSettings,
    type AppearanceTheme,
    type UIFontPreset,
} from "@mindtab/core";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { useCalendarSchedules } from "~/lib/calendar-schedules";

const COMMAND_PROMPT_INTERVAL_MS = 3000;

const themeOptions: {
    value: AppearanceTheme;
    label: string;
    icon: LucideIcon;
    colors: Pick<AppearanceSettings, "backgroundColor" | "foregroundColor" | "accentColor" | "contrast">;
}[] = [
    { value: "system", label: "Theme: System", icon: Laptop, colors: { backgroundColor: "#111111", foregroundColor: "#FCFCFC", accentColor: "#0169CC", contrast: 60 } },
    { value: "dark", label: "Theme: Dark", icon: Moon, colors: { backgroundColor: "#111111", foregroundColor: "#FCFCFC", accentColor: "#0169CC", contrast: 60 } },
    { value: "light", label: "Theme: Light", icon: Sun, colors: { backgroundColor: "#FFFFFF", foregroundColor: "#0D0D0D", accentColor: "#0169CC", contrast: 45 } },
];

const fontOptions: {
    value: UIFontPreset;
    label: string;
    icon: LucideIcon;
}[] = [
    { value: "inter", label: "UI Font: Inter", icon: Type },
    { value: "geist", label: "UI Font: Geist", icon: Type },
    { value: "system", label: "UI Font: System", icon: Type },
    { value: "satoshi", label: "UI Font: Satoshi", icon: Type },
];

export const CommandMenu = () => {
    const { logout, updateAppearance } = useAuth();
    const appearanceTheme = useAppStore((state) => state.appearanceTheme);
    const uiFontPreset = useAppStore((state) => state.uiFontPreset);
    const accentColor = useAppStore((state) => state.accentColor);
    const backgroundColor = useAppStore((state) => state.backgroundColor);
    const foregroundColor = useAppStore((state) => state.foregroundColor);
    const contrast = useAppStore((state) => state.contrast);
    const setAppearance = useAppStore((state) => state.setAppearance);

    const [searchQuery, setSearchQuery] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    // Create Note Dialog states
    const [isCreateNoteDialogOpen, setIsCreateNoteDialogOpen] =
        useState(false);
    const onCreateNoteDialogOpenChange = (open: boolean) => {
        setIsCreateNoteDialogOpen(open);
    };

    // Note Dialog states
    const [currentNote, setCurrentNote] = useState<{
        id: string;
        title: string;
        content: string;
    } | null>(null);

    const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);

    const onNoteDialogOpenChange = (open: boolean) => {
        setIsNoteDialogOpen(open);
        if (!open) {
            setCurrentNote(null);
        }
    };

    const [isTaskCreateOpen, setIsTaskCreateOpen] = useState(false);

    const onTaskCreateOpenChange = (open: boolean) => {
        setIsTaskCreateOpen(open);
    };

    const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);

    const [currentTask, setCurrentTask] = useState<any | null>(null);

    const onEditTaskDialogOpenChange = (open: boolean) => {
        setIsEditTaskDialogOpen(open);
        if (!open) {
            setCurrentTask(null);
        }
    };

    const createTaskMutation = useCreateTask();
    const isCreatingTask = createTaskMutation.isPending;
    const { scheduleTask } = useCalendarSchedules();
    const createTask = (values: TaskDialogInput & { status?: string; projectId?: string | null }) => {
        const { schedule, ...taskFields } = values;
        const schedulePayload = getScheduleDraftPayload(schedule);
        createTaskMutation.mutate(taskFields, {
            onSuccess: (createdTask: any) => {
                if (createdTask?.id && schedulePayload) {
                    scheduleTask(createdTask.id, schedulePayload.startAt, schedulePayload.durationMinutes);
                }
            },
            onSettled: () => setIsTaskCreateOpen(false),
        });
    };

    const updateTaskMutation = useUpdateTask();
    const isUpdatingTask = updateTaskMutation.isPending;
    const updateTask = (values: any) => {
        const updateKeys = Object.entries(values)
            .filter(([key, value]) => key !== "id" && value !== undefined)
            .map(([key]) => key);
        const isStatusOnlyUpdate = updateKeys.length === 1 && updateKeys[0] === "status";
        updateTaskMutation.mutate(values, {
            onSettled: () => {
                if (!isStatusOnlyUpdate) setIsEditTaskDialogOpen(false);
            },
        });
    };

    const { data: notesSearchResults, isFetching: isFetchingSearchResults } =
        useQuery({
            ...searchNotesQueryOptions(searchQuery ?? ""),
            enabled: open,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
        });

    const { data: tasksSearchResults, isFetching: isFetchingTasks } =
        useQuery({
            ...searchTasksQueryOptions(searchQuery ?? ""),
            enabled: open,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
        });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "k" && e.metaKey) {
                setOpen(true);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const toggleOpen = () => {
        setOpen(!open);
        if (!open) {
            setSearchQuery("");
        }
    };

    const handleAppearanceChange = useCallback(
        async (appearance: {
            theme?: AppearanceTheme;
            uiFont?: UIFontPreset;
        } & Partial<AppearanceSettings>) => {
            if (
                appearance.theme === appearanceTheme ||
                appearance.uiFont === uiFontPreset
            ) {
                setOpen(false);
                return;
            }

            const previousAppearance = {
                theme: appearanceTheme,
                uiFont: uiFontPreset,
                accentColor,
                backgroundColor,
                foregroundColor,
                contrast,
            };

            setAppearance(appearance);
            setOpen(false);

            try {
                await updateAppearance(appearance);
            } catch (error: any) {
                setAppearance(previousAppearance);
                toast.error(error?.message || "Failed to update appearance", {
                    position: "top-right",
                });
            }
        },
        [accentColor, appearanceTheme, backgroundColor, contrast, uiFontPreset, foregroundColor, setAppearance, updateAppearance]
    );

    const commandMenuGroups = useMemo(
        () => [
            {
                heading: "Tasks",
                items: [
                    {
                        label: "Create Task",
                        icon: PlusIcon,
                        onClick: () => {
                            setIsTaskCreateOpen(true);
                            setOpen(false);
                        },
                    },
                    {
                        label: "Search Tasks",
                        icon: ListTodo,
                        shortcut: "Keep typing",
                        onClick: () => {},
                    },
                ],
            },
            {
                heading: "Notes",
                items: [
                    {
                        label: "Create Note",
                        icon: PlusIcon,
                        onClick: () => {
                            setIsCreateNoteDialogOpen(true);
                            setOpen(false);
                        },
                    },
                    {
                        label: "Search Notes",
                        icon: Notebook,
                        shortcut: "Keep typing",
                        onClick: () => {},
                    },
                ],
            },
            {
                heading: "Appearance",
                items: [
                    ...themeOptions.map((option) => ({
                        label: option.label,
                        icon: option.icon,
                        active: option.value === appearanceTheme,
                        onClick: () =>
                            handleAppearanceChange({ theme: option.value, ...option.colors }),
                    })),
                    ...fontOptions.map((option) => ({
                        label: option.label,
                        icon: option.icon,
                        active: option.value === uiFontPreset,
                        onClick: () =>
                            handleAppearanceChange({ uiFont: option.value }),
                    })),
                ],
            },
            {
                heading: "Settings",
                items: [
                    {
                        label: "Logout",
                        icon: LogOut,
                        onClick: () => {
                            logout();
                            setOpen(false);
                        },
                    },
                ],
            },
        ],
        [appearanceTheme, uiFontPreset, handleAppearanceChange, logout]
    );

    const searchResults = useMemo(() => {
        const noteResults =
            (notesSearchResults as any[])?.map((note: any) => ({
                label: note.title!,
                icon: FileText,
                onClick: () => {
                    setCurrentNote(note);
                    setSearchQuery(null);
                    setIsNoteDialogOpen(true);
                    setOpen(false);
                },
            })) || [];

        const taskResults =
            (tasksSearchResults as any[])?.map((task: any) => ({
                label: task.title!,
                icon: ListTodo,
                onClick: () => {
                    setCurrentTask(task);
                    setSearchQuery(null);
                    setIsEditTaskDialogOpen(true);
                    setOpen(false);
                },
            })) || [];

        return [...noteResults, ...taskResults];
    }, [notesSearchResults, tasksSearchResults]);

    const placeholders = [
        "Search for anything ...",
        "Create a new Task",
        "Search your Tasks",
        "Add a new Note",
        "Find your Notes",
    ];

    const [currentPlaceholder, setCurrentPlaceholder] = useState(
        placeholders[0]!
    );

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPlaceholder((prev) => {
                const currentIndex = placeholders.indexOf(prev);
                const nextIndex = (currentIndex + 1) % placeholders.length;
                return placeholders[nextIndex]!;
            });
        }, COMMAND_PROMPT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const activeProjectId = useAppStore((state) => state.activeProjectId);

    return (
        <div className="flex items-center justify-center">
            <Button
                size={"sm"}
                variant="outline"
                className="command-trigger-shimmer flex h-9 w-56 items-center justify-between gap-2 rounded-md text-[length:var(--type-body-size)] text-muted-foreground transition-colors"
                style={{
                    backgroundImage:
                        "linear-gradient(110deg, var(--command-shimmer-from), 45%, var(--command-shimmer-to), 55%, var(--command-shimmer-from))",
                    backgroundSize: "200% 100%",
                }}
                onClick={toggleOpen}
            >
                <span className="command-placeholder-roll">{currentPlaceholder}</span>
                <span>&#8984;K</span>
            </Button>
            <CommandDialog open={open} onOpenChange={toggleOpen}>
                <CommandInput
                    placeholder="Search notes, tasks, commands..."
                    value={searchQuery ?? ""}
                    onValueChange={setSearchQuery}
                />
                <CommandList>
                    <CommandEmpty>
                        {isFetchingSearchResults ||
                        isFetchingTasks ? (
                            <div className="flex items-center justify-center">
                                <span className="animate-spin">
                                    <Loader className="h-5 w-5" />
                                </span>
                            </div>
                        ) : (
                            <span>No results found.</span>
                        )}
                    </CommandEmpty>
                    {commandMenuGroups.map((group) => (
                        <CommandMenuGroup
                            key={group.heading}
                            heading={group.heading}
                            items={group.items}
                        />
                    ))}
                    {searchResults.length > 0 && (
                        <CommandMenuGroup
                            heading="Search Results"
                            items={searchResults}
                        />
                    )}
                </CommandList>
            </CommandDialog>
            <CreateNoteDialog
                isOpen={isCreateNoteDialogOpen}
                onOpenChange={onCreateNoteDialogOpenChange}
                activeProjectId={activeProjectId}
            />
            <NoteDialog
                isOpen={isNoteDialogOpen}
                onOpenChange={onNoteDialogOpenChange}
                defaultMode={"view"}
                note={currentNote}
            />
            <TaskDialog
                mode="create"
                open={isTaskCreateOpen}
                onOpenChange={onTaskCreateOpenChange}
                defaultValues={{ status: "pending", projectId: activeProjectId }}
                onCreate={(task) => createTask({ ...task, status: "pending", projectId: activeProjectId })}
                isSaving={isCreatingTask}
            />
            {currentTask && (
                <TaskDialog
                    mode="edit"
                    open={isEditTaskDialogOpen}
                    onOpenChange={onEditTaskDialogOpenChange}
                    task={currentTask}
                    onUpdate={(_taskId, values) =>
                        updateTask({
                            ...values,
                            id: currentTask.id,
                        })
                    }
                    isSaving={isUpdatingTask}
                />
            )}
        </div>
    );
};

type TCommandMenuGroupProps = {
    heading: string;
    items: {
        label: string;
        shortcut?: string;
        icon?: LucideIcon;
        active?: boolean;
        onClick: () => void;
    }[];
};

const CommandMenuGroup = ({ heading, items }: TCommandMenuGroupProps) => {
    const tone = getCommandGroupTone(heading);

    return (
        <CommandGroup key={heading} heading={heading}>
            {items.map((item, index) => (
                <CommandItem
                    key={heading + index}
                    onSelect={item.onClick}
                    className="group"
                    value={item.label}
                >
                    <span
                        className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[var(--r-2)] border border-border bg-background text-muted-foreground transition-colors",
                            tone,
                            "group-data-[selected=true]:border-[var(--border-2)] group-data-[selected=true]:bg-[var(--bg-elev)]"
                        )}
                    >
                        {item.icon && <item.icon className="!h-3.5 !w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[length:var(--type-body-size)] text-muted-foreground transition-colors group-data-[selected=true]:text-foreground">
                        {item.label}
                    </span>
                    {item.active ? (
                        <CommandShortcut className="inline-flex items-center gap-1 border-0 bg-transparent px-0 py-0 font-mono text-[length:var(--type-code-size)] text-[var(--text-3)]">
                            <Check className="h-3 w-3" />
                            Active
                        </CommandShortcut>
                    ) : "shortcut" in item && (
                        <CommandShortcut className="border-0 bg-transparent px-0 py-0 font-mono text-[length:var(--type-code-size)] text-[var(--text-3)]">
                            {item.shortcut}
                        </CommandShortcut>
                    )}
                </CommandItem>
            ))}
        </CommandGroup>
    );
};

function getCommandGroupTone(heading: string) {
    if (heading === "Tasks" || heading === "Search Results") return "text-[var(--tone-task)]";
    if (heading === "Notes") return "text-[var(--tone-note)]";
    if (heading === "Appearance") return "text-[var(--tone-appearance)]";
    if (heading === "Settings") return "text-[var(--tone-danger)]";
    return "text-muted-foreground";
}
