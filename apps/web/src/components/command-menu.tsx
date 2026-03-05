import {
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
    useCreateGoal,
    useUpdateGoal,
    useUpdateHabit,
    useCreateHabit,
} from "~/api/hooks";
import { useAuth } from "~/api/hooks/use-auth";
import { CreateJournalDialog } from "./journals/create-journal-dialog";
import { JournalDialog } from "./journals/journal-dialog";
import { CreateGoalDialog } from "./goals/create-goal-dialog";
import { EditGoalDialog } from "./goals/edit-goal-dialog";
import { EditHabitDialog } from "./habits/edit-habit-dialog";
import { useAppStore } from "@mindtab/core";
import { toast } from "sonner";
import { CreateHabitDialog } from "./habits/create-habit-dialog";

export const CommandMenu = () => {
    const { logout } = useAuth();

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
                        shortcut: "Type to search...",
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
                        shortcut: "Type to search...",
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
                        shortcut: "Type to search...",
                        onClick: () => {},
                    },
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
        []
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
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const activeProjectId = useAppStore((state) => state.activeProjectId);

    return (
        <div className="flex items-center justify-center">
            <Button
                size={"sm"}
                variant="outline"
                className="flex items-center justify-between text-sm text-muted-foreground font-light rounded-md gap-2 h-9 w-56 animate-shimmer bg-[linear-gradient(110deg,#0a0a0a,45%,#1e2631,55%,#0a0a0a)] bg-[length:200%_100%] transition-colors"
                onClick={toggleOpen}
            >
                <span className="animate-moveUpDown">{currentPlaceholder}</span>
                <span>&#8984;K</span>
            </Button>
            <CommandDialog open={open} onOpenChange={toggleOpen}>
                <CommandInput
                    placeholder="Type a command or search..."
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
        onClick: () => void;
    }[];
};

const CommandMenuGroup = ({ heading, items }: TCommandMenuGroupProps) => {
    return (
        <CommandGroup key={heading} heading={heading}>
            {items.map((item, index) => (
                <CommandItem
                    key={heading + index}
                    onSelect={item.onClick}
                    className="group"
                    value={item.label}
                >
                    <span className="flex items-center gap-2 text-muted-foreground group-hover:text-primary group-active:text-primary group-data-[selected=true]:text-primary">
                        {item.icon && <item.icon className="!h-4 !w-4" />}
                        {item.label}
                    </span>
                    {"shortcut" in item && (
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                    )}
                </CommandItem>
            ))}
        </CommandGroup>
    );
};
