import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { formatDateKey, getLastDays, isHabitCompleted } from "./habit-utils";

type StreakBoxesProps = {
    habit: any;
    habitTracker: any[];
    completedSet?: Set<string>;
    className?: string;
    density?: "compact" | "roomy";
};

export const StreakBoxes: React.FC<StreakBoxesProps> = ({
    habit,
    habitTracker,
    completedSet,
    className,
    density = "compact",
}) => {
    const last7Days = getLastDays(7);
    const resolvedCompletedSet = React.useMemo(() => {
        if (completedSet) return completedSet;

        return new Set(
            habitTracker
                .filter((tracker: any) => tracker.habitId === habit.id && tracker.status === "completed" && tracker.date)
                .map((tracker: any) => `${tracker.habitId}:${tracker.date}`)
        );
    }, [completedSet, habit.id, habitTracker]);

    return (
        <TooltipProvider>
            <div className={cn("grid grid-cols-7 gap-1", className)}>
                {last7Days.map((date) => {
                    const dateKey = formatDateKey(date);
                    const isCompleted = isHabitCompleted(resolvedCompletedSet, habit.id, dateKey);
                    const isToday = dateKey === formatDateKey(new Date());
                    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

                    return (
                        <Tooltip key={dateKey}>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        "block rounded-[var(--r-1)] border transition-colors duration-150",
                                        density === "roomy" ? "h-5 min-w-5" : "size-3",
                                        isCompleted
                                            ? "border-[var(--green)] bg-[var(--green)] shadow-[0_0_0_1px_var(--green-soft)]"
                                            : "border-[var(--border-2)] bg-background",
                                        isToday && !isCompleted && "border-[var(--border-2)] bg-background"
                                    )}
                                />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{dayName}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </TooltipProvider>
    );
};
