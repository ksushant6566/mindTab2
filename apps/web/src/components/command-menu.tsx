import {
    Check,
    FileText,
    Goal,
    Grid,
    Laptop,
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
    searchJournalsQueryOptions,
    searchGoalsQueryOptions,
    searchHabitsQueryOptions,
    habitTrackerQueryOptions,
    useCreateGoal,
    useUpdateGoal,
    useUpdateHabit,
    useCreateHabit,
    useTrackHabit,
    useUntrackHabit,
} from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { CreateJournalDialog } from "./journals/create-journal-dialog";
import { JournalDialog } from "./journals/journal-dialog";
import { CreateGoalDialog } from "./goals/create-goal-dialog";
import { EditGoalDialog } from "./goals/edit-goal-dialog";
import { EditHabitDialog } from "./habits/edit-habit-dialog";
import {
    useAppStore,
    type AppearanceTheme,
    type FontPreset,
} from "@mindtab/core";
import { toast } from "sonner";
import { CreateHabitDialog } from "./habits/create-habit-dialog";
import { cn } from "~/lib/utils";

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

    // Create Journal Dialog states
    const [isCreateJournalDialogOpen, setIsCreateJournalDialogOpen] =
        useState(false);
    const onCreateJournalDialogOpenChange = (open: boolean) => {
        setIsCreateJournalDialogOpen(open);
    };

    // Journal Dialog states
    const [currentJournal, setCurrentJournal] = useState<{
        id: string;
        title: string;
        content: string;
    } | null>(null);

    const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false);

    const onJournalDialogOpenChange = (open: boolean) => {
        setIsJournalDialogOpen(open);
        if (!open) {
            setCurrentJournal(null);
        }
    };

    const [isCreateGoalDialogOpen, setIsCreateGoalDialogOpen] = useState(false);

    const onCreateGoalDialogOpenChange = (open: boolean) => {
        setIsCreateGoalDialogOpen(open);
    };

    const [isEditGoalDialogOpen, setIsEditGoalDialogOpen] = useState(false);

    const [currentGoal, setCurrentGoal] = useState<any | null>(null);

    const onEditGoalDialogOpenChange = (open: boolean) => {
        setIsEditGoalDialogOpen(open);
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

    const createGoalMutation = useCreateGoal();
    const isCreatingGoal = createGoalMutation.isPending;
    const createGoal = (values: any) => {
        createGoalMutation.mutate(values, {
            onSettled: () => setIsCreateGoalDialogOpen(false),
        });
    };

    const updateGoalMutation = useUpdateGoal();
    const isUpdatingGoal = updateGoalMutation.isPending;
    const updateGoal = (values: any) => {
        updateGoalMutation.mutate(values, {
            onSettled: () => setIsEditGoalDialogOpen(false),
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

    const { data: journalsSearchResults, isFetching: isFetchingSearchResults } =
        useQuery({
            ...searchJournalsQueryOptions(searchQuery ?? ""),
            enabled: open,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
        });

    const { data: goalsSearchResults, isFetching: isFetchingGoals } =
        useQuery({
            ...searchGoalsQueryOptions(searchQuery ?? ""),
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
                heading: "Goals",
                items: [
                    {
                        label: "Create Goal",
                        icon: PlusIcon,
                        onClick: () => {
                            setIsCreateGoalDialogOpen(true);
                            setOpen(false);
                        },
                    },
                    {
                        label: "Search Goals",
                        icon: Goal,
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
                            setIsCreateJournalDialogOpen(true);
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
        const journalResults =
            (journalsSearchResults as any[])?.map((journal: any) => ({
                label: journal.title!,
                icon: FileText,
                onClick: () => {
                    setCurrentJournal(journal);
                    setSearchQuery(null);
                    setIsJournalDialogOpen(true);
                    setOpen(false);
                },
            })) || [];

        const goalResults =
            (goalsSearchResults as any[])?.map((goal: any) => ({
                label: goal.title!,
                icon: Goal,
                onClick: () => {
                    setCurrentGoal(goal);
                    setSearchQuery(null);
                    setIsEditGoalDialogOpen(true);
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

        return [...journalResults, ...goalResults, ...habitResults];
    }, [journalsSearchResults, goalsSearchResults, habitsSearchResults]);

    const placeholders = [
        "Search for anything ...",
        "Create a new Goal",
        "Search your Goals",
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
                    placeholder="Search notes, goals, habits, commands..."
                    value={searchQuery ?? ""}
                    onValueChange={setSearchQuery}
                />
                <CommandList>
                    <CommandEmpty>
                        {isFetchingSearchResults ||
                        isFetchingGoals ||
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
            <CreateJournalDialog
                isOpen={isCreateJournalDialogOpen}
                onOpenChange={onCreateJournalDialogOpenChange}
                activeProjectId={activeProjectId}
            />
            <JournalDialog
                isOpen={isJournalDialogOpen}
                onOpenChange={onJournalDialogOpenChange}
                defaultMode={"view"}
                journal={currentJournal}
            />
            <CreateGoalDialog
                open={isCreateGoalDialogOpen}
                onOpenChange={onCreateGoalDialogOpenChange}
                onSave={createGoal as any}
                onCancel={() => setIsCreateGoalDialogOpen(false)}
                loading={isCreatingGoal}
                defaultValues={{
                    projectId: activeProjectId,
                }}
            />
            {currentGoal && (
                <EditGoalDialog
                    open={isEditGoalDialogOpen}
                    onOpenChange={onEditGoalDialogOpenChange}
                    goal={currentGoal}
                    onSave={(values: any) =>
                        (updateGoal as any)({
                            ...values,
                            id: values.id!,
                            title: values.title ?? undefined,
                            description: values.description ?? undefined,
                        })
                    }
                    onCancel={() => setIsEditGoalDialogOpen(false)}
                    loading={isUpdatingGoal}
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
    if (heading === "Goals" || heading === "Search Results") return "text-[var(--green)]";
    if (heading === "Notes") return "text-[var(--amber)]";
    if (heading === "Habits") return "text-[var(--cyan)]";
    if (heading === "Appearance") return "text-[var(--violet)]";
    if (heading === "Settings") return "text-[var(--rose)]";
    return "text-muted-foreground";
}
