import type { CheckedState } from "@radix-ui/react-checkbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Flame,
    Pencil,
    Plus,
    Repeat2,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
    habitsQueryOptions,
    habitTrackerQueryOptions,
    useCreateHabit,
    useDeleteHabit,
    useTrackHabit,
    useUntrackHabit,
    useUpdateHabit,
} from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { CreateHabitDialog } from "./create-habit-dialog";
import { EditHabitDialog } from "./edit-habit-dialog";
import { HabitCell } from "./habit-cell";
import {
    addDays,
    dayLabels,
    formatDateKey,
    getCompletedSet,
    getCompletionCount,
    getCurrentStreak,
    isHabitCompleted,
    isHabitVisibleByDate,
    startOfWeek,
} from "./habit-utils";
import type { HabitRecord, HabitTrackerRecord } from "./habit-utils";

const MAX_MONTHS_BACK = 11;

type HabitSummary = {
    habit: HabitRecord;
    completed: number;
    total: number;
    rate: number;
    streak: number;
};

type DayStats = {
    total: number;
    completed: number;
    rate: number;
};

export function HabitsPage() {
    const today = useMemo(() => startOfDay(new Date()), []);
    const todayKey = useMemo(() => formatDateKey(today), [today]);
    const currentMonth = useMemo(() => startOfMonth(today), [today]);
    const oldestMonth = useMemo(() => addMonths(currentMonth, -MAX_MONTHS_BACK), [currentMonth]);
    const [visibleMonth, setVisibleMonth] = useState(currentMonth);
    const [selectedDate, setSelectedDate] = useState(today);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [editHabitState, setEditHabitState] = useState<{
        habit: HabitRecord;
        mode: "view" | "edit";
    } | null>(null);
    const successAudioRef = useRef<HTMLAudioElement | null>(null);
    const errorAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        successAudioRef.current = new Audio("/audio/success.mp3");
        errorAudioRef.current = new Audio("/audio/error.mp3");
    }, []);

    const { data: habitsData, isLoading: isLoadingHabits } = useQuery({
        ...habitsQueryOptions(),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const { data: habitTrackerData } = useQuery({
        ...habitTrackerQueryOptions(),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const habits = ((habitsData as HabitRecord[]) ?? []);
    const habitTracker = ((habitTrackerData as HabitTrackerRecord[]) ?? []);
    const completedSet = useMemo(() => getCompletedSet(habitTracker), [habitTracker]);

    const createHabitMutation = useCreateHabit();
    const updateHabitMutation = useUpdateHabit();
    const {
        mutate: deleteHabit,
        isPending: isDeletingHabit,
        variables: deleteHabitVariables,
    } = useDeleteHabit();
    const trackHabitMutation = useTrackHabit();
    const untrackHabitMutation = useUntrackHabit();

    const monthDates = useMemo(() => {
        return getMonthDates(visibleMonth).filter((date) => date <= today);
    }, [today, visibleMonth]);

    const calendarDates = useMemo(() => getCalendarDates(visibleMonth), [visibleMonth]);
    const dayStats = useMemo(
        () => getDayStatsMap(habits, completedSet, calendarDates, today),
        [calendarDates, completedSet, habits, today]
    );
    const monthStats = useMemo(() => getMonthStats(habits, completedSet, monthDates), [completedSet, habits, monthDates]);
    const habitSummaries = useMemo(() => {
        return habits
            .map((habit) => getHabitSummary(habit, completedSet, monthDates))
            .filter((summary) => summary.total > 0)
            .sort((left, right) => right.rate - left.rate || left.habit.title.localeCompare(right.habit.title));
    }, [completedSet, habits, monthDates]);
    const habitSummaryById = useMemo(() => {
        return new Map(habitSummaries.map((summary) => [summary.habit.id, summary]));
    }, [habitSummaries]);

    const selectedDateKey = formatDateKey(selectedDate);
    const selectedDayHabits = useMemo(() => {
        return habits.filter((habit) => isHabitVisibleByDate(habit, selectedDate));
    }, [habits, selectedDate]);
    const selectedDayStats = dayStats.get(selectedDateKey) ?? { total: 0, completed: 0, rate: 0 };
    const selectedDateIsToday = selectedDateKey === todayKey;
    const isCurrentMonth = isSameMonth(visibleMonth, currentMonth);
    const isOldestMonth = isSameMonth(visibleMonth, oldestMonth);
    const monthLabel = visibleMonth.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
    const selectedDateLabel = selectedDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });

    const playSound = (type: "success" | "error") => {
        const audio = type === "success" ? successAudioRef.current : errorAudioRef.current;
        if (!audio) return;

        audio.currentTime = 0;
        audio.play().catch((error) => console.error("Error playing sound:", error));
    };

    const createHabit = (values: any) => {
        createHabitMutation.mutate(values, {
            onSuccess: () => setIsCreateDialogOpen(false),
            onError: (error: any) => {
                toast.error(error.message || "Failed to create habit", {
                    position: "top-right",
                });
            },
        });
    };

    const updateHabit = (values: any, onSuccess?: () => void) => {
        updateHabitMutation.mutate(values, {
            onSuccess,
            onError: (error: any) => {
                toast.error(error.message || "Failed to update habit", {
                    position: "top-right",
                });
            },
        });
    };

    const trackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        playSound("success");
        trackHabitMutation.mutate({ id: habitId, date });
    };

    const untrackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        playSound("error");
        untrackHabitMutation.mutate({ id: habitId, date });
    };

    const moveMonth = (offset: number) => {
        const nextMonth = clampMonth(addMonths(visibleMonth, offset), oldestMonth, currentMonth);
        const nextSelectedDate = isSameMonth(nextMonth, currentMonth) ? today : nextMonth;

        setVisibleMonth(nextMonth);
        setSelectedDate(nextSelectedDate);
    };

    const goToCurrentMonth = () => {
        setVisibleMonth(currentMonth);
        setSelectedDate(today);
    };

    const onTodayCheckedChange = (habit: HabitRecord, checked: CheckedState) => {
        if (checked === true) trackHabit({ habitId: habit.id, date: todayKey });
        else if (checked === false) untrackHabit({ habitId: habit.id, date: todayKey });
    };

    return (
        <div className="flex h-full min-h-0 w-full max-w-screen-2xl flex-col gap-4">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold leading-8 tracking-normal text-foreground">Habits</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        <span>{habits.length} habits</span>
                        <span>{monthStats.completed}/{monthStats.total} done</span>
                        <span>{monthStats.rate}% month</span>
                    </div>
                </div>
                <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    onClick={() => setIsCreateDialogOpen(true)}
                    disabled={createHabitMutation.isPending}
                    loading={createHabitMutation.isPending}
                >
                    <Plus className="h-4 w-4" />
                    Add Habit
                </Button>
            </header>

            <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-3)] border border-border bg-[var(--bg-elev)]">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="size-8 rounded-[var(--r-2)]"
                                onClick={() => moveMonth(-1)}
                                disabled={isOldestMonth}
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="min-w-[150px] text-center text-base font-semibold text-foreground">
                                {monthLabel}
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="size-8 rounded-[var(--r-2)]"
                                onClick={() => moveMonth(1)}
                                disabled={isCurrentMonth}
                                aria-label="Next month"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isCurrentMonth && (
                                <Button type="button" variant="ghost" size="sm" onClick={goToCurrentMonth}>
                                    This month
                                </Button>
                            )}
                            <MonthRate rate={monthStats.rate} />
                        </div>
                    </div>

                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-4">
                        {isLoadingHabits ? (
                            <CalendarSkeleton />
                        ) : (
                            <div className="min-w-[720px]">
                                <div className="grid grid-cols-7 gap-2 pb-2">
                                    {dayLabels.map((label) => (
                                        <div
                                            key={label}
                                            className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                                        >
                                            {label}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                    {calendarDates.map((date) => {
                                        const dateKey = formatDateKey(date);
                                        const stats = dayStats.get(dateKey) ?? { total: 0, completed: 0, rate: 0 };
                                        const inMonth = isSameMonth(date, visibleMonth);
                                        const isToday = dateKey === todayKey;
                                        const isSelected = dateKey === selectedDateKey;
                                        const isFuture = date > today;

                                        return (
                                            <button
                                                key={dateKey}
                                                type="button"
                                                onClick={() => inMonth && !isFuture && setSelectedDate(date)}
                                                disabled={!inMonth || isFuture}
                                                className={cn(
                                                    "min-h-[94px] rounded-[var(--r-2)] border border-border bg-background p-2 text-left transition-colors",
                                                    inMonth && "hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)]",
                                                    !inMonth && "cursor-default opacity-35",
                                                    isFuture && "cursor-default opacity-55 hover:border-border hover:bg-background",
                                                    isSelected && "border-[var(--ink-line)] bg-[var(--bg-soft)] shadow-[inset_0_0_0_1px_var(--ink-line)]",
                                                    isToday && "border-[var(--cyan)]"
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <span className="text-sm font-medium text-foreground">{date.getDate()}</span>
                                                    {isToday && (
                                                        <span className="rounded-[var(--r-1)] bg-[var(--cyan)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-background">
                                                            Today
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all",
                                                            stats.rate >= 80 && "bg-[var(--green)]",
                                                            stats.rate >= 40 && stats.rate < 80 && "bg-[var(--amber)]",
                                                            stats.rate > 0 && stats.rate < 40 && "bg-[var(--rose)]",
                                                            stats.rate === 0 && "bg-transparent"
                                                        )}
                                                        style={{ width: `${stats.rate}%` }}
                                                    />
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.06em]">
                                                    <span className="text-muted-foreground">
                                                        {isFuture ? "Future" : stats.total > 0 ? `${stats.completed}/${stats.total}` : "No habits"}
                                                    </span>
                                                    {stats.completed > 0 && (
                                                        <span className="text-[var(--green)]">{stats.rate}%</span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <aside className="min-h-0">
                    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--r-3)] border border-border bg-[var(--bg-elev)]">
                        <div className="border-b border-border px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold text-foreground">{selectedDateLabel}</h2>
                                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                        {selectedDayStats.completed}/{selectedDayStats.total} complete · {monthLabel}
                                    </div>
                                </div>
                                <div className="flex size-10 items-center justify-center rounded-[var(--r-2)] border border-border bg-background">
                                    <CalendarDays className="h-4 w-4 text-[var(--cyan)]" />
                                </div>
                            </div>
                        </div>
                        <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                            {selectedDayHabits.length > 0 ? (
                                selectedDayHabits.map((habit) => {
                                    const isCompleted = isHabitCompleted(completedSet, habit.id, selectedDateKey);
                                    const summary = habitSummaryById.get(habit.id) ?? getHabitSummary(habit, completedSet, monthDates);
                                    return (
                                        <HabitDayRow
                                            key={habit.id}
                                            habit={habit}
                                            summary={summary}
                                            isCompleted={isCompleted}
                                            selectedDateIsToday={selectedDateIsToday}
                                            todayKey={todayKey}
                                            isDeleting={isDeletingHabit}
                                            deleteVariables={deleteHabitVariables as string | undefined}
                                            onCheckedChange={(checked) => onTodayCheckedChange(habit, checked)}
                                            onOpen={(mode) => setEditHabitState({ habit, mode })}
                                            onDelete={() => deleteHabit(habit.id)}
                                        />
                                    );
                                })
                            ) : (
                                <div className="px-3 py-10 text-center">
                                    <div className="text-sm font-medium text-foreground">No habits on this day</div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        className="mt-3 gap-2"
                                        onClick={() => setIsCreateDialogOpen(true)}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Habit
                                    </Button>
                                </div>
                            )}
                        </div>
                    </section>
                </aside>
            </main>

            <CreateHabitDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSave={createHabit}
                onCancel={() => setIsCreateDialogOpen(false)}
                loading={createHabitMutation.isPending}
            />
            {editHabitState && (
                <EditHabitDialog
                    isOpen={Boolean(editHabitState)}
                    onOpenChange={(open) => {
                        if (!open) setEditHabitState(null);
                    }}
                    defaultMode={editHabitState.mode}
                    habit={editHabitState.habit}
                    onSave={(habit) => updateHabit(habit, () => setEditHabitState(null))}
                    onCancel={() => setEditHabitState(null)}
                    loading={updateHabitMutation.isPending}
                    habitTracker={habitTracker}
                    trackHabit={trackHabit}
                    untrackHabit={untrackHabit}
                />
            )}
        </div>
    );
}

function HabitDayRow({
    habit,
    summary,
    isCompleted,
    selectedDateIsToday,
    todayKey,
    isDeleting,
    deleteVariables,
    onCheckedChange,
    onOpen,
    onDelete,
}: {
    habit: HabitRecord;
    summary: HabitSummary;
    isCompleted: boolean;
    selectedDateIsToday: boolean;
    todayKey: string;
    isDeleting: boolean;
    deleteVariables?: string;
    onCheckedChange: (checked: CheckedState) => void;
    onOpen: (mode: "view" | "edit") => void;
    onDelete: () => void;
}) {
    const frequencyLabel = habit.frequency === "weekly" ? "Weekly" : "Daily";
    const statusLabel = isCompleted ? "Done" : selectedDateIsToday ? "Open" : "Not done";

    return (
        <div className="group rounded-[var(--r-2)] border border-border bg-background px-3 py-3 transition-colors hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)]">
            <div className="flex items-start gap-3">
                <div className="size-8 shrink-0">
                    {selectedDateIsToday ? (
                        <HabitCell
                            habit={habit}
                            date={todayKey}
                            isEditable
                            isChecked={isCompleted}
                            onCheckedChange={onCheckedChange}
                            variant="card"
                        />
                    ) : (
                        <div
                            className={cn(
                                "flex size-8 items-center justify-center rounded-[var(--r-2)] border border-border bg-background",
                                isCompleted && "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]"
                            )}
                        >
                            <CheckCircle2 className={cn("h-4 w-4", !isCompleted && "opacity-0")} />
                        </div>
                    )}
                </div>

                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen("view")}>
                    <div className="truncate text-sm font-medium leading-5 text-foreground">{habit.title}</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                        <span className={cn(isCompleted && "text-[var(--green)]")}>{statusLabel}</span>
                        <span className="inline-flex items-center gap-1">
                            <Repeat2 className="h-3 w-3" />
                            {frequencyLabel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Flame className="h-3 w-3 text-[var(--amber)]" />
                            {summary.streak}d
                        </span>
                        <span>{summary.completed}/{summary.total}</span>
                    </div>
                </button>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-[var(--r-2)]"
                        onClick={() => onOpen("edit")}
                        aria-label={`Edit ${habit.title}`}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--rose)]"
                        onClick={onDelete}
                        disabled={isDeleting && deleteVariables === habit.id}
                        aria-label={`Delete ${habit.title}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <div
                        className={cn(
                            "h-full rounded-full",
                            summary.rate >= 80 && "bg-[var(--green)]",
                            summary.rate >= 40 && summary.rate < 80 && "bg-[var(--amber)]",
                            summary.rate > 0 && summary.rate < 40 && "bg-[var(--rose)]",
                            summary.rate === 0 && "bg-transparent"
                        )}
                        style={{ width: `${summary.rate}%` }}
                    />
                </div>
                <div className="w-9 text-right font-mono text-[10px] text-muted-foreground">{summary.rate}%</div>
            </div>
        </div>
    );
}

function MonthRate({ rate }: { rate: number }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-[var(--r-2)] border border-border bg-background px-3 py-2">
            <CheckCircle2 className={cn("h-4 w-4", rate > 0 ? "text-[var(--green)]" : "text-muted-foreground")} />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {rate}% complete
            </span>
        </div>
    );
}

function CalendarSkeleton() {
    return (
        <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-2 pb-2">
                {dayLabels.map((label) => (
                    <div key={label} className="h-4 rounded bg-[var(--bg-soft)]" />
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 42 }, (_, index) => (
                    <div key={index} className="min-h-[94px] animate-pulse rounded-[var(--r-2)] bg-[var(--bg-soft)]" />
                ))}
            </div>
        </div>
    );
}

function getHabitSummary(
    habit: HabitRecord,
    completedSet: Set<string>,
    monthDates: Date[]
): HabitSummary {
    const dates = monthDates.filter((date) => isHabitVisibleByDate(habit, date));
    const completed = getCompletionCount(completedSet, habit.id, dates);
    const total = dates.length;

    return {
        habit,
        completed,
        total,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        streak: getCurrentStreak(completedSet, habit.id),
    };
}

function getMonthStats(habits: HabitRecord[], completedSet: Set<string>, dates: Date[]) {
    return dates.reduce(
        (stats, date) => {
            const visibleHabits = habits.filter((habit) => isHabitVisibleByDate(habit, date));
            const completed = visibleHabits.filter((habit) => isHabitCompleted(completedSet, habit.id, formatDateKey(date))).length;
            const total = stats.total + visibleHabits.length;
            const done = stats.completed + completed;

            return {
                total,
                completed: done,
                rate: total > 0 ? Math.round((done / total) * 100) : 0,
            };
        },
        { total: 0, completed: 0, rate: 0 }
    );
}

function getDayStatsMap(
    habits: HabitRecord[],
    completedSet: Set<string>,
    dates: Date[],
    today: Date
) {
    const stats = new Map<string, DayStats>();

    dates.forEach((date) => {
        const key = formatDateKey(date);
        const isFuture = date > today;
        const visibleHabits = isFuture ? [] : habits.filter((habit) => isHabitVisibleByDate(habit, date));
        const completed = visibleHabits.filter((habit) => isHabitCompleted(completedSet, habit.id, key)).length;
        const total = visibleHabits.length;

        stats.set(key, {
            total,
            completed,
            rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        });
    });

    return stats;
}

function getCalendarDates(month: Date) {
    const start = startOfWeek(startOfMonth(month));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function getMonthDates(month: Date) {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const dates: Date[] = [];
    const cursor = new Date(first);

    while (cursor <= last) {
        dates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
}

function startOfDay(date: Date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
    const value = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    value.setHours(0, 0, 0, 0);
    return value;
}

function addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isSameMonth(left: Date, right: Date) {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth()
    );
}

function clampMonth(month: Date, min: Date, max: Date) {
    if (month < min) return min;
    if (month > max) return max;
    return month;
}
