import { CheckedState } from "@radix-ui/react-checkbox";
import { Link, useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Flame, Repeat2, TrendingUp } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { isRichTextEmpty, sanitizeRichText } from "~/lib/rich-text";
import { cn, getTimeAgo } from "~/lib/utils";
import { EditHabit, EditHabitProps } from "./edit-habit";
import { HabitCell } from "./habit-cell";
import {
    formatDateKey,
    getCompletedSet,
    getCompletionCount,
    getCurrentStreak,
    getLastDays,
    getTodayKey,
    isHabitCompleted,
    isHabitVisibleByDate,
} from "./habit-utils";

type TEditHabitDialogProps = EditHabitProps & {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    defaultMode?: "edit" | "view";
    habitTracker: any[];
    trackHabit: (habit: { habitId: string; date: string }) => void;
    untrackHabit: (habit: { habitId: string; date: string }) => void;
};

type HistoryRange = "week" | "month" | "year";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
});

const historyTransition = {
    duration: 0.22,
    ease: [0.16, 0.84, 0.32, 1],
} as const;

export const EditHabitDialog = ({
    isOpen,
    onOpenChange,
    defaultMode = "edit",
    habit,
    onCancel,
    habitTracker,
    trackHabit,
    untrackHabit,
    ...props
}: TEditHabitDialogProps) => {
    const location = useLocation();
    const [mode, setMode] = useState<"edit" | "view">(defaultMode);
    const [historyRange, setHistoryRange] = useState<HistoryRange>("month");
    const bodyRef = useRef<HTMLDivElement>(null);
    const [bodyHeight, setBodyHeight] = useState<number | "auto">("auto");

    useEffect(() => {
        if (isOpen) {
            setMode(defaultMode);
            setHistoryRange("month");
        }
    }, [isOpen, defaultMode]);

    const frequencyLabel = habit.frequency === "weekly" ? "Weekly" : "Daily";
    const today = getTodayKey();
    const todayDate = useMemo(() => {
        const value = new Date();
        value.setHours(0, 0, 0, 0);
        return value;
    }, []);
    const completedSet = useMemo(() => getCompletedSet(habitTracker), [habitTracker]);
    const isCompletedToday = isHabitCompleted(completedSet, habit.id, today);
    const streak = useMemo(() => getCurrentStreak(completedSet, habit.id), [completedSet, habit.id]);
    const weekDates = useMemo(() => getLastDays(7), []);
    const monthDates = useMemo(() => getLastDays(30), []);
    const yearDates = useMemo(() => getLastDays(365), []);
    const createdLabel = useMemo(() => {
        if (!habit.createdAt) return "Unknown";
        return getTimeAgo(new Date(habit.createdAt));
    }, [habit.createdAt]);
    const descriptionHtml = useMemo(() => sanitizeRichText(habit.description), [habit.description]);
    const hasDescription = !isRichTextEmpty(habit.description);

    const weekSummary = getCompletionSummary(completedSet, habit, weekDates, todayDate);
    const monthSummary = getCompletionSummary(completedSet, habit, monthDates, todayDate);
    const yearSummary = getCompletionSummary(completedSet, habit, yearDates, todayDate);
    const showAllHabitsLink = location.pathname !== "/habits";

    const handleCancel = () => {
        if (defaultMode === "view") {
            setMode("view");
            return;
        }

        onCancel();
    };

    const handleTodayCheckedChange = (checked: CheckedState) => {
        if (checked === true) trackHabit({ habitId: habit.id, date: today });
        else if (checked === false) untrackHabit({ habitId: habit.id, date: today });
    };

    useMeasuredHeight(bodyRef, setBodyHeight);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {habit.title}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <span>{frequencyLabel}</span>
                        <span className="text-[var(--text-4)]">·</span>
                        <span>{createdLabel}</span>
                    </DialogDescription>
                </DialogHeader>

                <motion.div
                    animate={{ height: bodyHeight }}
                    initial={false}
                    transition={historyTransition}
                    className="min-h-0 overflow-hidden bg-[var(--bg)]/45"
                >
                    <div ref={bodyRef} className="px-5 pb-5 pt-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="inline-flex rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] p-0.5">
                                {(["view", "edit"] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setMode(item)}
                                        className={cn(
                                            "h-6 rounded-[calc(var(--r-2)-1px)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                                            mode === item && "bg-primary text-primary-foreground"
                                        )}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                    <Repeat2 className="h-3 w-3" />
                                    <span>{frequencyLabel}</span>
                                </div>
                                {showAllHabitsLink && (
                                    <Button asChild type="button" variant="secondary" size="sm" className="h-7 gap-1.5 px-2">
                                        <Link to="/habits">
                                            <CalendarDays className="h-3.5 w-3.5" />
                                            All habits
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {mode === "view" ? (
                            <div className="grid min-h-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
                                <aside className="space-y-2">
                                    <TodayCard
                                        habit={habit}
                                        today={today}
                                        isCompletedToday={isCompletedToday}
                                        onCheckedChange={handleTodayCheckedChange}
                                    />
                                    <HabitDetail label="Current streak" value={`${streak}d`} icon={<Flame className="h-3.5 w-3.5 text-[var(--amber)]" />} />
                                    <HabitDetail label="Last 30 days" value={`${monthSummary.completed}/${monthSummary.total}`} icon={<TrendingUp className="h-3.5 w-3.5" />} />
                                    <HabitDetail label="Year rate" value={`${yearSummary.rate}%`} icon={<CalendarDays className="h-3.5 w-3.5" />} />
                                    <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-3">
                                        <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Description</div>
                                        {hasDescription ? (
                                            <div
                                                className="habit-description-prose mt-2 text-xs leading-5 text-muted-foreground"
                                                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                                            />
                                        ) : (
                                            <p className="mt-2 text-xs leading-5 text-muted-foreground">No description yet.</p>
                                        )}
                                    </div>
                                </aside>

                                <motion.section
                                    layout
                                    transition={historyTransition}
                                    className="min-h-0 overflow-hidden rounded-[var(--r-3)] border border-border bg-background p-4"
                                >
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                                Habit history
                                            </div>
                                            <div className="mt-1 text-sm text-foreground">
                                                {historyRange === "week" && `${weekSummary.completed}/${weekSummary.total} completed in the last 7 days`}
                                                {historyRange === "month" && `${monthSummary.completed}/${monthSummary.total} completed in the last 30 days`}
                                                {historyRange === "year" && `${yearSummary.completed}/${yearSummary.total} completed in the last 365 days`}
                                            </div>
                                        </div>
                                        <div className="inline-flex rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] p-0.5">
                                            {(["week", "month", "year"] as const).map((item) => (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    onClick={() => setHistoryRange(item)}
                                                    className={cn(
                                                        "h-7 rounded-[calc(var(--r-2)-1px)] px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                                                        historyRange === item && "bg-primary text-primary-foreground"
                                                    )}
                                                >
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <motion.div layout transition={historyTransition} className="overflow-hidden">
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            <motion.div
                                                key={historyRange}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={historyTransition}
                                            >
                                                {historyRange === "week" && (
                                                    <WeekHistory habit={habit} completedSet={completedSet} dates={weekDates} />
                                                )}
                                                {historyRange === "month" && (
                                                    <MonthHistory habit={habit} completedSet={completedSet} today={todayDate} />
                                                )}
                                                {historyRange === "year" && (
                                                    <YearHistory habit={habit} completedSet={completedSet} today={todayDate} />
                                                )}
                                            </motion.div>
                                        </AnimatePresence>
                                    </motion.div>
                                </motion.section>
                            </div>
                        ) : (
                            <EditHabit
                                habit={habit}
                                onCancel={handleCancel}
                                {...props}
                            />
                        )}
                    </div>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
};

function TodayCard({
    habit,
    today,
    isCompletedToday,
    onCheckedChange,
}: {
    habit: any;
    today: string;
    isCompletedToday: boolean;
    onCheckedChange: (checked: CheckedState) => void;
}) {
    return (
        <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-3">
            <div className="flex items-center gap-3">
                <div className="size-9 shrink-0">
                    <HabitCell
                        habit={habit}
                        date={today}
                        isEditable
                        isChecked={isCompletedToday}
                        onCheckedChange={onCheckedChange}
                    />
                </div>
                <div className="min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                        Today
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                        {isCompletedToday ? "Done today" : "Mark complete"}
                    </div>
                </div>
                <span
                    className={cn(
                        "ml-auto rounded-[var(--r-1)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]",
                        isCompletedToday ? "text-[var(--green)]" : "text-muted-foreground"
                    )}
                >
                    {isCompletedToday ? "Done" : "10 XP"}
                </span>
            </div>
        </div>
    );
}

function HabitDetail({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon?: ReactNode;
}) {
    return (
        <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-3">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-2 text-xl font-semibold leading-none text-foreground">{value}</div>
        </div>
    );
}

function WeekHistory({
    habit,
    completedSet,
    dates,
}: {
    habit: any;
    completedSet: Set<string>;
    dates: Date[];
}) {
    return (
        <div className="grid grid-cols-7 gap-2">
            {dates.map((date, index) => {
                const dateKey = formatDateKey(date);
                const isCompleted = isHabitCompleted(completedSet, habit.id, dateKey);
                return (
                    <div
                        key={dateKey}
                        className={cn(
                            "rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-3 text-center",
                            isCompleted && "border-[var(--green)] bg-[var(--green-soft)]"
                        )}
                    >
                        <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{weekdayLabels[index]}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{date.getDate()}</div>
                        <div className={cn("mt-2 text-[10px] text-muted-foreground", isCompleted && "text-[var(--green)]")}>
                            {isCompleted ? "Done" : "Missed"}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MonthHistory({
    habit,
    completedSet,
    today,
}: {
    habit: any;
    completedSet: Set<string>;
    today: Date;
}) {
    const month = useMemo(() => buildMonth(new Date(today.getFullYear(), today.getMonth(), 1)), [today]);

    return (
        <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">{monthFormatter.format(month.date)}</h3>
            <CalendarGrid habit={habit} completedSet={completedSet} days={month.days} today={today} />
        </div>
    );
}

function YearHistory({
    habit,
    completedSet,
    today,
}: {
    habit: any;
    completedSet: Set<string>;
    today: Date;
}) {
    const months = useMemo(() => {
        return Array.from({ length: 12 }, (_, index) => {
            const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
            return buildMonth(date);
        });
    }, [today]);

    return (
        <div className="custom-scrollbar max-h-[52vh] overflow-y-auto pr-2">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {months.map((month) => (
                    <section key={month.id} className="rounded-[var(--r-3)] border border-border bg-[var(--bg-soft)] p-3">
                        <h3 className="mb-3 text-sm font-semibold text-foreground">{monthFormatter.format(month.date)}</h3>
                        <CalendarGrid habit={habit} completedSet={completedSet} days={month.days} today={today} compact />
                    </section>
                ))}
            </div>
        </div>
    );
}

function CalendarGrid({
    habit,
    completedSet,
    days,
    today,
    compact = false,
}: {
    habit: any;
    completedSet: Set<string>;
    days: Array<Date | null>;
    today: Date;
    compact?: boolean;
}) {
    return (
        <div className="grid grid-cols-7 gap-1">
            {weekdayLabels.map((label, index) => (
                <div
                    key={`label-${index}`}
                    className="text-center font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
                >
                    {label}
                </div>
            ))}
            {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="aspect-square" />;

                const dateKey = formatDateKey(day);
                const isCompleted = isHabitCompleted(completedSet, habit.id, dateKey);
                const isFuture = day > today;
                const isVisible = isHabitVisibleByDate(habit, day);

                return (
                    <div
                        key={dateKey}
                        className={cn(
                            "flex aspect-square items-center justify-center rounded-[var(--r-1)] border border-border bg-background font-mono text-[10px] text-muted-foreground",
                            compact && "text-[9px]",
                            isVisible && !isFuture && "text-foreground",
                            isCompleted && "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]",
                            (!isVisible || isFuture) && "opacity-35"
                        )}
                        title={`${dateKey}${isCompleted ? " completed" : ""}`}
                    >
                        {day.getDate()}
                    </div>
                );
            })}
        </div>
    );
}

function getCompletionSummary(completedSet: Set<string>, habit: any, dates: Date[], today: Date) {
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const visibleDates = dates.filter((date) => date <= todayEnd && isHabitVisibleByDate(habit, date));
    const completed = getCompletionCount(completedSet, habit.id, visibleDates);
    const total = visibleDates.length;

    return {
        completed,
        total,
        rate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
}

function useMeasuredHeight(
    ref: React.RefObject<HTMLDivElement>,
    setHeight: (height: number | "auto") => void
) {
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;

        const updateHeight = () => {
            setHeight(element.offsetHeight);
        };

        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        observer.observe(element);

        return () => observer.disconnect();
    }, [ref, setHeight]);
}

function buildMonth(date: Date) {
    const monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDay = new Date(monthDate);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const mondayIndex = (firstDay.getDay() + 6) % 7;
    const days: Array<Date | null> = Array.from({ length: mondayIndex }, () => null);

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
        days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    }

    while (days.length % 7 !== 0) {
        days.push(null);
    }

    return {
        id: formatDateKey(monthDate),
        date: monthDate,
        days,
    };
}
