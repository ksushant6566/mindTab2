import { CheckedState } from "@radix-ui/react-checkbox";
import { Edit3, Flame, Repeat2, Trash2 } from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import { HabitCell } from "./habit-cell";
import {
    formatDateKey,
    getCompletionCount,
    getCurrentStreak,
    isHabitCompleted,
} from "./habit-utils";

type HabitRowProps = {
    habit: any;
    dates: Date[];
    isCurrentWeek: boolean;
    currentDayIndex: number;
    completedSet: Set<string>;
    onOpen: (habit: any, mode: "view" | "edit") => void;
    onDelete: (id: string) => void;
    isDeleting: boolean;
    deleteVariables?: string;
    onTrack: (habit: { habitId: string; date: string }) => void;
    onUntrack: (habit: { habitId: string; date: string }) => void;
};

export const HabitRow: React.FC<HabitRowProps> = React.memo(({
    habit,
    dates,
    isCurrentWeek,
    currentDayIndex,
    completedSet,
    onOpen,
    onDelete,
    isDeleting,
    deleteVariables,
    onTrack,
    onUntrack,
}) => {
    const completedThisWeek = getCompletionCount(completedSet, habit.id, dates);
    const streak = getCurrentStreak(completedSet, habit.id);
    const frequencyLabel = habit.frequency === "weekly" ? "Weekly" : "Daily";

    const onCheckedChange = (checked: CheckedState, date: string) => {
        if (checked === true) onTrack({ habitId: habit.id, date });
        else if (checked === false) onUntrack({ habitId: habit.id, date });
    };

    return (
        <div className="group/row grid w-full grid-cols-[minmax(148px,1fr)_repeat(7,minmax(40px,46px))_54px] items-center gap-1.5 px-0.5 py-1.5">
            <button
                type="button"
                onClick={() => onOpen(habit, "view")}
                className="min-w-0 text-left"
            >
                <div className="truncate text-sm font-medium leading-5 text-foreground">
                    {habit.title}
                </div>
                <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                    <span className="inline-flex shrink-0 items-center gap-1">
                        <Repeat2 className="h-3.5 w-3.5" />
                        {frequencyLabel}
                    </span>
                    <span className="shrink-0 text-[var(--text-4)]">·</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-[var(--amber)]" />
                        {streak}d
                    </span>
                    <span className="shrink-0 text-[var(--text-4)]">·</span>
                    <span className="shrink-0">{completedThisWeek}/7</span>
                </div>
            </button>

            {dates.map((date, dayIndex) => {
                const dateKey = formatDateKey(date);
                const isToday = isCurrentWeek && dayIndex === currentDayIndex;
                const isChecked = isHabitCompleted(completedSet, habit.id, dateKey);

                return (
                    <div
                        key={`${habit.id}-${dateKey}`}
                        className="flex h-10 items-center justify-center"
                    >
                        <HabitCell
                            habit={habit}
                            date={dateKey}
                            isEditable={isToday}
                            isChecked={isChecked}
                            onCheckedChange={onCheckedChange}
                        />
                    </div>
                );
            })}

            <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-[var(--r-2)]"
                    onClick={() => onOpen(habit, "edit")}
                    aria-label={`Edit ${habit.title}`}
                >
                    <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--rose)]"
                    onClick={() => onDelete(habit.id)}
                    disabled={isDeleting && deleteVariables === habit.id}
                    aria-label={`Delete ${habit.title}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
});
