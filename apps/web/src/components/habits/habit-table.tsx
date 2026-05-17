import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { HabitRow } from "./habit-row";
import {
    dayLabels,
    formatDateKey,
    getCompletedSet,
    getWeekDates,
    getWeekLabel,
    isHabitVisibleByDate,
} from "./habit-utils";

type THabitTableProps = {
    habits: any[];
    isCreatingHabit: boolean;
    isDeletingHabit: boolean;
    deleteHabitVariables?: string;
    deleteHabit: (id: string) => void;
    trackHabit: (habit: { habitId: string; date: string }) => void;
    untrackHabit: (habit: { habitId: string; date: string }) => void;
    habitTracker: any[];
    setIsCreateDialogOpen: (open: boolean) => void;
    onOpenHabit: (habit: any, mode: "view" | "edit") => void;
};

export const HabitTable: React.FC<THabitTableProps> = ({
    habits,
    isCreatingHabit,
    isDeletingHabit,
    deleteHabitVariables,
    deleteHabit,
    trackHabit,
    untrackHabit,
    habitTracker,
    setIsCreateDialogOpen,
    onOpenHabit,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const currentWeekRef = useRef<HTMLElement>(null);
    const today = useMemo(() => new Date(), []);
    const currentDayIndex = useMemo(() => (today.getDay() + 6) % 7, [today]);

    const [showScrollButton, setShowScrollButton] = useState(false);
    const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null);

    const completedSet = useMemo(() => getCompletedSet(habitTracker), [habitTracker]);
    const weeksToRender = useMemo(() => {
        return [-4, -3, -2, -1, 0, 1].map((offset) => {
            const dates = getWeekDates(today, offset);
            return {
                id: formatDateKey(dates[0]!),
                dates,
                offset,
                isCurrentWeek: offset === 0,
            };
        });
    }, [today]);

    const handleScroll = useCallback(() => {
        if (!containerRef.current || !currentWeekRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const currentWeekRect = currentWeekRef.current.getBoundingClientRect();
        const topDelta = currentWeekRect.top - containerRect.top;

        setShowScrollButton(Math.abs(topDelta) > 8);
        setScrollDirection(topDelta < 0 ? "up" : "down");
    }, []);

    const scrollToCurrentWeek = useCallback((behavior: ScrollBehavior = "smooth") => {
        if (!containerRef.current || !currentWeekRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const currentWeekRect = currentWeekRef.current.getBoundingClientRect();
        const top = containerRef.current.scrollTop + currentWeekRect.top - containerRect.top;

        containerRef.current.scrollTo({ top, behavior });

        if (behavior === "smooth") {
            window.setTimeout(handleScroll, 220);
        } else {
            requestAnimationFrame(handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        scrollToCurrentWeek("auto");

        const container = containerRef.current;
        container?.addEventListener("scroll", handleScroll);
        return () => {
            container?.removeEventListener("scroll", handleScroll);
        };
    }, [handleScroll, scrollToCurrentWeek]);

    return (
        <div className="relative flex h-full min-h-0 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        Habits · {habits.length}
                    </div>
                </div>
                <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                    disabled={isCreatingHabit}
                    loading={isCreatingHabit}
                >
                    <Plus className="h-4 w-4" />
                    Add Habit
                </Button>
            </div>

            <div
                ref={containerRef}
                className="custom-scrollbar min-h-0 flex-1 snap-y snap-mandatory overflow-x-hidden overflow-y-auto scroll-smooth pr-2"
                style={{
                    scrollBehavior: "smooth",
                    WebkitOverflowScrolling: "touch",
                }}
            >
                {weeksToRender.map((week) => {
                    const visibleHabits = habits.filter((habit) => isHabitVisibleByDate(habit, week.dates[6]!));
                    if (visibleHabits.length === 0 && !week.isCurrentWeek) return null;

                    return (
                        <section
                            key={week.id}
                            ref={week.isCurrentWeek ? currentWeekRef : null}
                            className={cn(
                                "mb-6 snap-start border-t border-border pt-5 first:border-t-0 first:pt-0",
                                week.isCurrentWeek && "border-[var(--border-2)]"
                            )}
                        >
                            <div className="mb-3 flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground">
                                        {week.isCurrentWeek ? "This Week" : week.offset > 0 ? "Next Week" : `${Math.abs(week.offset)} Week${Math.abs(week.offset) === 1 ? "" : "s"} Ago`}
                                    </h2>
                                    <div className="mt-1 text-sm text-muted-foreground">{getWeekLabel(week.dates)}</div>
                                </div>
                                {week.isCurrentWeek && (
                                    <span className="rounded-[var(--r-2)] border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                        Current
                                    </span>
                                )}
                            </div>

                            <div className="grid w-full grid-cols-[minmax(148px,1fr)_repeat(7,minmax(40px,46px))_54px] items-center gap-1.5 px-0.5 pb-1.5">
                                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Habit</div>
                                {week.dates.map((date, index) => {
                                    const dateKey = formatDateKey(date);
                                    const isToday = week.isCurrentWeek && index === currentDayIndex;
                                    return (
                                        <div
                                            key={dateKey}
                                            className={cn(
                                                "text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
                                                isToday && "text-foreground"
                                            )}
                                        >
                                            <div>{dayLabels[index]}</div>
                                            <div className="mt-0.5 text-[9.5px] text-[var(--text-4)]">{date.getDate()}</div>
                                        </div>
                                    );
                                })}
                                <div />
                            </div>

                            <div className="space-y-1">
                                {visibleHabits.length > 0 ? (
                                    visibleHabits.map((habit) => (
                                        <HabitRow
                                            key={`${week.id}-${habit.id}`}
                                            habit={habit}
                                            dates={week.dates}
                                            isCurrentWeek={week.isCurrentWeek}
                                            currentDayIndex={currentDayIndex}
                                            completedSet={completedSet}
                                            onOpen={onOpenHabit}
                                            onDelete={deleteHabit}
                                            isDeleting={isDeletingHabit}
                                            deleteVariables={deleteHabitVariables}
                                            onTrack={trackHabit}
                                            onUntrack={untrackHabit}
                                        />
                                    ))
                                ) : (
                                    <div className="w-full rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-elev)]/55 px-4 py-8 text-center">
                                        <div className="text-sm font-medium text-foreground">No habits yet</div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="mt-3 gap-2"
                                            onClick={() => setIsCreateDialogOpen(true)}
                                            disabled={isCreatingHabit}
                                        >
                                            <Plus className="h-4 w-4" />
                                            Add First Habit
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>

            {showScrollButton && (
                <TooltipProvider>
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <Button
                                className="absolute right-4 top-16 size-9 rounded-[var(--r-2)]"
                                onClick={() => scrollToCurrentWeek()}
                                title="Scroll to current week"
                                size="icon"
                                variant="default"
                            >
                                {scrollDirection === "up" ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Current week</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
};
