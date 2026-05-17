import { CheckedState } from "@radix-ui/react-checkbox";
import { Edit3, Flame, Plus, Repeat2, Trash2 } from "lucide-react";
import React, { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { HabitCell } from "./habit-cell";
import { StreakBoxes } from "./streak-boxes";
import {
    getCompletionCount,
    getCompletedSet,
    getCurrentStreak,
    getLastDays,
    getTodayKey,
    isHabitCompleted,
} from "./habit-utils";

type CollapsedHabitsProps = {
    habits: any[];
    habitTracker: any[];
    trackHabit: (habit: { habitId: string; date: string }) => void;
    untrackHabit: (habit: { habitId: string; date: string }) => void;
    setIsCreateDialogOpen: (open: boolean) => void;
    isCreatingHabit: boolean;
    onOpenHabit: (habit: any, mode: "view" | "edit") => void;
    deleteHabit: (id: string) => void;
    isDeletingHabit: boolean;
    deleteHabitVariables?: string;
};

export const CollapsedHabits: React.FC<CollapsedHabitsProps> = ({
    habits,
    habitTracker,
    trackHabit,
    untrackHabit,
    setIsCreateDialogOpen,
    isCreatingHabit,
    onOpenHabit,
    deleteHabit,
    isDeletingHabit,
    deleteHabitVariables,
}) => {
    const today = getTodayKey();
    const completedSet = useMemo(() => getCompletedSet(habitTracker), [habitTracker]);
    const last7Days = useMemo(() => getLastDays(7), []);

    const onCheckedChange = (checked: CheckedState, habitId: string) => {
        if (checked === true) trackHabit({ habitId, date: today });
        else if (checked === false) untrackHabit({ habitId, date: today });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        Habits · {habits.length}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Today</div>
                </div>
                <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    size="sm"
                    className="gap-2"
                    variant="secondary"
                    disabled={isCreatingHabit}
                    loading={isCreatingHabit}
                >
                    <Plus className="h-4 w-4" />
                    Add Habit
                </Button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-3">
                {habits.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                        {habits.map((habit: any) => {
                            const isChecked = isHabitCompleted(completedSet, habit.id, today);
                            const completedLast7Days = getCompletionCount(completedSet, habit.id, last7Days);
                            const streak = getCurrentStreak(completedSet, habit.id);
                            const frequencyLabel = habit.frequency === "weekly" ? "Weekly" : "Daily";

                            return (
                                <article
                                    key={habit.id}
                                    className={cn(
                                        "group/card relative min-h-[74px] overflow-hidden rounded-[var(--r-3)] border border-border bg-card p-3 text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                                        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/[0.04]",
                                        "hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[0_10px_28px_-26px_rgba(0,0,0,0.85)]",
                                        isChecked && "border-[var(--border-2)] bg-[var(--bg-elev)]"
                                    )}
                                >
                                    <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                        <button
                                            type="button"
                                            onClick={() => onOpenHabit(habit, "view")}
                                            className="min-w-0 text-left"
                                        >
                                            <h3 className="truncate text-[13.5px] font-medium leading-5 text-foreground">
                                                {habit.title}
                                            </h3>
                                            <div className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                                                <span className="inline-flex shrink-0 items-center gap-1">
                                                    <Repeat2 className="h-3 w-3" />
                                                    {frequencyLabel}
                                                </span>
                                                <span className="shrink-0 text-[var(--text-4)]">·</span>
                                                <span className="inline-flex shrink-0 items-center gap-1">
                                                    <Flame className="h-3 w-3 text-[var(--amber)]" />
                                                    {streak}d
                                                </span>
                                                <span className="shrink-0 text-[var(--text-4)]">·</span>
                                                <span className="shrink-0">{completedLast7Days}/7</span>
                                            </div>
                                        </button>

                                        <HabitCell
                                            habit={habit}
                                            date={today}
                                            isEditable
                                            isChecked={isChecked}
                                            onCheckedChange={(checked) => onCheckedChange(checked, habit.id)}
                                            variant="card"
                                        />
                                    </div>

                                    <div className="mt-3 pr-14">
                                        <StreakBoxes habit={habit} habitTracker={habitTracker} completedSet={completedSet} />
                                    </div>

                                    <div className="absolute bottom-2 right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 rounded-[var(--r-2)]"
                                            onClick={() => onOpenHabit(habit, "edit")}
                                            aria-label={`Edit ${habit.title}`}
                                        >
                                            <Edit3 className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--rose)]"
                                            onClick={() => deleteHabit(habit.id)}
                                            disabled={isDeletingHabit && deleteHabitVariables === habit.id}
                                            aria-label={`Delete ${habit.title}`}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-elev)]/55 px-4 py-10 text-center">
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
        </div>
    );
};
