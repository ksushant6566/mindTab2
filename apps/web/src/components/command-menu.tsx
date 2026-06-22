import {
    Check,
    FileText,
    Grid,
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
    searchHabitsQueryOptions,
    habitTrackerQueryOptions,
    useCreateTask,
    useUpdateTask,
    useUpdateHabit,
    useCreateHabit,
    useTrackHabit,
    useUntrackHabit,
} from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { CreateNoteDialog } from "./notes/create-note-dialog";
import { NoteDialog } from "./notes/note-dialog";
import { TaskDialog, type TaskDialogInput } from "./tasks/task-dialog";
import { getScheduleDraftPayload } from "./tasks/task-schedule-fields";
import { EditHabitDialog } from "./habits/edit-habit-dialog";
import {
    useAppStore,
    type AppearanceTheme,
    type FontPreset,
} from "@mindtab/core";
import { toast } from "sonner";
import { CreateHabitDialog } from "./habits/create-habit-dialog";
import { cn } from "~/lib/utils";
import { useCalendarSchedules } from "~/lib/calendar-schedules";

const COMMAND_PROMPT_INTERVAL_MS = 3000;

const themeOptions: {
    value: AppearanceTheme;
    label: string;
    icon: LucideIcon;
}[] = [
    { value: "midnight", label: "Theme: Midnight", icon: Moon },
    { value: "graphite", label: "Theme: Graphite", icon: Laptop },
    { value: "paper", label: "Theme: Paper", icon: Sun },
];

const fontOptions: {
    value: FontPreset;
    label: string;
    icon: LucideIcon;
}[] = [
    { value: "inter", label: "Font: Inter", icon: Type },
    { value: "geist", label: "Font: Geist", icon: Type },
    { value: "system", label: "Font: System", icon: Type },
];

export const CommandMenu = () => {
    const { logout, updateAppearance } = useAuth();
    const appearanceTheme = useAppStore((state) => state.appearanceTheme);
    const fontPreset = useAppStore((state) => state.fontPreset);
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

    const [currentHabit, setCurrentHabit] = useState<any | null>(null);

    const [isEditHabitDialogOpen, setIsEditHabitDialogOpen] = useState(false);

    const onEditHabitDialogOpenChange = (open: boolean) => {
        setIsEditHabitDialogOpen(open);
        if (!open) {
            setCurrentHabit(null);
        }
    };

    const [isCreateHabitDialogOpen, setIsCreateHabitDialogOpen] =
        useState(false);

    const onCreateHabitDialogOpenChange = (open: boolean) => {
        setIsCreateHabitDialogOpen(open);
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

    const updateHabitMutation = useUpdateHabit();
    const isUpdatingHabit = updateHabitMutation.isPending;
    const updateHabit = (values: any) => {
        updateHabitMutation.mutate(values, {
            onSuccess: () => setIsEditHabitDialogOpen(false),
            onError: (error: any) => {
                toast.error(error.message || "Failed to update habit", {
                    position: "top-right",
                });
            },
        });
    };

    const createHabitMutation = useCreateHabit();
    const isCreatingHabit = createHabitMutation.isPending;
    const createHabit = (values: any) => {
        createHabitMutation.mutate(values, {
            onSuccess: () => setIsCreateHabitDialogOpen(false),
            onError: (error: any) => {
                toast.error(error.message || "Failed to create habit", {
                    position: "top-right",
                });
            },
        });
    };

    const { data: habitTracker } = useQuery({
        ...habitTrackerQueryOptions(),
        enabled: Boolean(currentHabit && isEditHabitDialogOpen),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const trackHabitMutation = useTrackHabit();
    const untrackHabitMutation = useUntrackHabit();

    const trackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        trackHabitMutation.mutate({ id: habitId, date });
    };

    const untrackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        untrackHabitMutation.mutate({ id: habitId, date });
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

    const { data: habitsSearchResults, isFetching: isFetchingHabits } =
        useQuery({
            ...searchHabitsQueryOptions(searchQuery ?? ""),
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
            font?: FontPreset;
        }) => {
            if (
                appearance.theme === appearanceTheme ||
                appearance.font === fontPreset
            ) {
                setOpen(false);
                return;
            }

            const previousAppearance = {
                theme: appearanceTheme,
                font: fontPreset,
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
        [appearanceTheme, fontPreset, setAppearance, updateAppearance]
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
                heading: "Habits",
                items: [
                    {
                        label: "Create Habit",
                        icon: PlusIcon,
                        onClick: () => {
                            setIsCreateHabitDialogOpen(true);
                            setOpen(false);
                        },
                    },
                    {
                        label: "Search Habits",
                        icon: Grid,
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
                            handleAppearanceChange({ theme: option.value }),
                    })),
                    ...fontOptions.map((option) => ({
                        label: option.label,
                        icon: option.icon,
                        active: option.value === fontPreset,
                        onClick: () =>
                            handleAppearanceChange({ font: option.value }),
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
        [appearanceTheme, fontPreset, handleAppearanceChange, logout]
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

        const habitResults =
            (habitsSearchResults as any[])?.map((habit: any) => ({
                label: habit.title!,
                icon: Grid,
                onClick: () => {
                    setCurrentHabit(habit);
                    setSearchQuery(null);
                    setIsEditHabitDialogOpen(true);
                    setOpen(false);
                },
            })) || [];

        return [...noteResults, ...taskResults, ...habitResults];
    }, [notesSearchResults, tasksSearchResults, habitsSearchResults]);

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
                className="command-trigger-shimmer flex h-9 w-56 items-center justify-between gap-2 rounded-md text-sm font-light text-muted-foreground transition-colors"
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
                    placeholder="Search notes, tasks, habits, commands..."
                    value={searchQuery ?? ""}
                    onValueChange={setSearchQuery}
                />
                <CommandList>
                    <CommandEmpty>
                        {isFetchingSearchResults ||
                        isFetchingTasks ||
                        isFetchingHabits ? (
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
            {currentHabit && (
                <EditHabitDialog
                    isOpen={isEditHabitDialogOpen}
                    onOpenChange={onEditHabitDialogOpenChange}
                    habit={currentHabit}
                    onSave={(values: any) =>
                        (updateHabit as any)({
                            ...values,
                            id: values.id!,
                            title: values.title ?? undefined,
                            description: values.description ?? undefined,
                        })
                    }
                    onCancel={() => setIsEditHabitDialogOpen(false)}
                    loading={isUpdatingHabit}
                    defaultMode="view"
                    habitTracker={(habitTracker as any[]) ?? []}
                    trackHabit={trackHabit}
                    untrackHabit={untrackHabit}
                />
            )}
            <CreateHabitDialog
                isOpen={isCreateHabitDialogOpen}
                onOpenChange={onCreateHabitDialogOpenChange}
                onSave={createHabit as any}
                onCancel={() => setIsCreateHabitDialogOpen(false)}
                loading={isCreatingHabit}
            />
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
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-muted-foreground transition-colors group-data-[selected=true]:text-foreground">
                        {item.label}
                    </span>
                    {item.active ? (
                        <CommandShortcut className="inline-flex items-center gap-1 border-0 bg-transparent px-0 py-0 text-[9.5px] text-[var(--text-3)]">
                            <Check className="h-3 w-3" />
                            Active
                        </CommandShortcut>
                    ) : "shortcut" in item && (
                        <CommandShortcut className="border-0 bg-transparent px-0 py-0 text-[9.5px] text-[var(--text-3)]">
                            {item.shortcut}
                        </CommandShortcut>
                    )}
                </CommandItem>
            ))}
        </CommandGroup>
    );
};

function getCommandGroupTone(heading: string) {
    if (heading === "Tasks" || heading === "Search Results") return "text-[var(--green)]";
    if (heading === "Notes") return "text-[var(--amber)]";
    if (heading === "Habits") return "text-[var(--cyan)]";
    if (heading === "Appearance") return "text-[var(--violet)]";
    if (heading === "Settings") return "text-[var(--rose)]";
    return "text-muted-foreground";
}
