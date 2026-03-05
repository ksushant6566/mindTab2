import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
} from "react";
import { Button } from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "~/components/ui/tooltip";
import { CreateHabit } from "./create-habit";
import { HabitRow } from "./habit-row";

type THabitTableProps = {
    habits: any[];
    isCreatingHabit: boolean;
    isUpdatingHabit: boolean;
    isDeletingHabit: boolean;
    deleteHabitVariables: { id: string } | undefined;
    createHabit: (habit: any) => void;
    updateHabit: (habit: any) => void;
    deleteHabit: (habit: { id: string }) => void;
    trackHabit: (habit: { habitId: string; date: string }) => void;
    untrackHabit: (habit: { habitId: string; date: string }) => void;
    habitTracker: any[];
};

export const HabitTable: React.FC<THabitTableProps> = ({
    habits,
    isCreatingHabit,
    isUpdatingHabit,
    isDeletingHabit,
    deleteHabitVariables,
    createHabit,
    updateHabit,
    deleteHabit,
    trackHabit,
    untrackHabit,
    habitTracker,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const currentWeekRef = useRef<HTMLDivElement>(null);
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isCreateHabitOpen, setIsCreateHabitOpen] = useState(false);
    const [editHabitId, setEditHabitId] = useState<string | null>(null);
    const [scrollDirection, setScrollDirection] = useState<
        "up" | "down" | null
    >(null);

    const handleScroll = useCallback(() => {
        if (containerRef.current && currentWeekRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const currentWeekRect =
                currentWeekRef.current.getBoundingClientRect();
            setShowScrollButton(
                currentWeekRect.top < containerRect.top ||
                    currentWeekRect.bottom > containerRect.bottom
            );
            setScrollDirection(
                currentWeekRect.top < containerRect.top ? "down" : "up"
            );
        }
    }, []);

    useEffect(() => {
        if (containerRef.current && currentWeekRef.current) {
            containerRef.current.scrollTo({
                top: currentWeekRef.current.offsetTop,
                behavior: "instant" as ScrollBehavior,
            });
        }

        handleScroll();

        const container = containerRef.current;
        container?.addEventListener("scroll", handleScroll);
        return () => {
            container?.removeEventListener("scroll", handleScroll);
            if (scrollTimerRef.current) {
                clearTimeout(scrollTimerRef.current);
            }
        };
    }, [handleScroll]);

    const scrollToCurrentWeek = () => {
        if (containerRef.current && currentWeekRef.current) {
            containerRef.current.scrollTo({
                top: currentWeekRef.current.offsetTop,
                behavior: "smooth",
            });
        }
    };

    const handleEdit = useCallback((id: string) => {
        setEditHabitId(id);
    }, []);

    const handleDelete = useCallback(
        (id: string) => {
            deleteHabit({ id });
        },
        [deleteHabit]
    );

    const handleSaveEdit = useCallback(
        (habit: any) => {
            if (editHabitId) {
                updateHabit({ ...habit, id: editHabitId });
                setEditHabitId(null);
            }
        },
        [editHabitId, updateHabit]
    );

    const handleCreateHabit = useCallback(
        (habit: any) => {
            createHabit(habit);
            setIsCreateHabitOpen(false);
        },
        [createHabit]
    );

    const getDateFromWeekAndDay = (week: number, day: number) => {
        const year = new Date().getFullYear();
        const start = new Date(year, 0, 1);

        const diff = week * 1000 * 60 * 60 * 24 * 7;
        const date = new Date(start.getTime() + diff);

        const offset = start.getDay() - 1;

        date.setDate(date.getDate() + day - offset);
        return date.toLocaleDateString().split("/").reverse().join("-");
    };

    const currentWeek = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);

        const offsetInDays = start.getDay() - 1;
        const offsetInTime = offsetInDays * 1000 * 60 * 60 * 24;

        const diff = now.getTime() - start.getTime() + offsetInTime;
        const oneWeek = 1000 * 60 * 60 * 24 * 7;

        return Math.floor(diff / oneWeek);
    }, []);

    const weeksToRender = useMemo(() => {
        const startWeek = Math.max(0, currentWeek - 4);
        const endWeek = Math.min(51, currentWeek + 1);
        return Array.from(
            { length: endWeek - startWeek + 1 },
            (_, i) => startWeek + i
        );
    }, [currentWeek]);

    const currentDay = useMemo(() => {
        return new Date().getDay() || 7;
    }, []);

    return (
        <div className="relative">
            <div
                ref={containerRef}
                className={`custom-scrollbar overflow-auto max-h-[80vh] snap-y snap-mandatory scroll-smooth`}
                style={{
                    scrollBehavior: "smooth",
                    WebkitOverflowScrolling: "touch",
                }}
            >
                {weeksToRender.map((weekIndex) => {
                    const isCurrentWeek = weekIndex === currentWeek;
                    return (
                        <div
                            key={weekIndex}
                            className="snap-start mb-16"
                            ref={isCurrentWeek ? currentWeekRef : null}
                        >
                            <div className="flex flex-col items-start gap-1 mb-4">
                                <h2 className="text-xl font-semibold">
                                    Week {weekIndex + 1}
                                    {isCurrentWeek && " (Current)"}
                                </h2>
                                <div className="flex items-center justify-start gap-2 text-sm text-muted-foreground">
                                    {(() => {
                                        const startDate = getDateFromWeekAndDay(
                                            weekIndex,
                                            0
                                        );
                                        const endDate = getDateFromWeekAndDay(
                                            weekIndex,
                                            6
                                        );
                                        if (startDate && endDate) {
                                            const formatDate = (
                                                dateString: string
                                            ) => {
                                                const date = new Date(
                                                    dateString
                                                );
                                                return date.toLocaleString(
                                                    "en-US",
                                                    {
                                                        day: "2-digit",
                                                        month: "long",
                                                    }
                                                );
                                            };
                                            return `${formatDate(startDate)} - ${formatDate(endDate)}`;
                                        }
                                    })()}
                                </div>
                            </div>
                            <Table className="table-fixed habit-table">
                                <TableHeader>
                                    <TableRow className="border-none">
                                        <TableHead className="w-32">
                                            Habit
                                        </TableHead>
                                        {[
                                            "Mon",
                                            "Tue",
                                            "Wed",
                                            "Thu",
                                            "Fri",
                                            "Sat",
                                            "Sun",
                                        ].map((day, index) => (
                                            <TableHead
                                                key={day}
                                                className={`text-center ${
                                                    isCurrentWeek &&
                                                    index + 1 === currentDay
                                                        ? "text-primary"
                                                        : ""
                                                }`}
                                            >
                                                {day}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {habits?.map((habit) => {
                                        const weekEndDate = new Date(
                                            getDateFromWeekAndDay(weekIndex, 6)
                                        );
                                        const habitCreatedDate = new Date(
                                            habit.createdAt
                                        );

                                        const shouldShowHabit =
                                            habitCreatedDate <= weekEndDate;

                                        return (
                                            shouldShowHabit && (
                                                <HabitRow
                                                    key={habit.id}
                                                    habit={habit}
                                                    weekIndex={weekIndex}
                                                    currentWeek={currentWeek}
                                                    currentDay={currentDay}
                                                    isEditing={
                                                        habit.id ===
                                                            editHabitId &&
                                                        weekIndex ===
                                                            currentWeek
                                                    }
                                                    onEdit={handleEdit}
                                                    onDelete={handleDelete}
                                                    onSaveEdit={handleSaveEdit}
                                                    isUpdating={isUpdatingHabit}
                                                    isDeleting={isDeletingHabit}
                                                    deleteVariables={
                                                        deleteHabitVariables
                                                    }
                                                    habitTracker={habitTracker}
                                                    onTrack={trackHabit}
                                                    onUntrack={untrackHabit}
                                                    getDate={
                                                        getDateFromWeekAndDay
                                                    }
                                                />
                                            )
                                        );
                                    })}
                                    {habits?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8}>
                                                <div className="flex flex-col items-center justify-center gap-4 -mt-2">
                                                    <span className="text-base">
                                                        No habits found
                                                    </span>
                                                    <Button
                                                        variant="default"
                                                        size={"sm"}
                                                        onClick={() => {
                                                            scrollToCurrentWeek();
                                                            setIsCreateHabitOpen(
                                                                true
                                                            );
                                                        }}
                                                    >
                                                        <Plus className="h-4 w-4 mr-1" />
                                                        Add First Habit
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            {isCurrentWeek &&
                                (isCreateHabitOpen ? (
                                    <div className="mt-4">
                                        <CreateHabit
                                            onSave={handleCreateHabit}
                                            onCancel={() =>
                                                setIsCreateHabitOpen(false)
                                            }
                                        />
                                    </div>
                                ) : (
                                    <Button
                                        onClick={() =>
                                            setIsCreateHabitOpen(true)
                                        }
                                        variant={"ghost"}
                                        disabled={isCreatingHabit}
                                        className={`mt-2 ${isCreatingHabit ? "mr-2" : ""}`}
                                    >
                                        <Plus className="h-4 w-4 mr-1" />
                                        {isCreatingHabit ? "Creating..." : "Add Habit"}
                                    </Button>
                                ))}
                        </div>
                    );
                })}
            </div>
            {showScrollButton && (
                <TooltipProvider>
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <Button
                                className="absolute top-0 right-4"
                                onClick={scrollToCurrentWeek}
                                title="Scroll to current week"
                                size="sm"
                                variant="default"
                            >
                                {scrollDirection !== "down" ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Scroll to current week</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
};
