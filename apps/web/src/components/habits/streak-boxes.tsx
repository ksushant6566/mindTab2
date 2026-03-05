import React from 'react'
import { cn } from '~/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'

type StreakBoxesProps = { habit: any; habitTracker: any[]; }

export const StreakBoxes: React.FC<StreakBoxesProps> = ({ habit, habitTracker }) => {
    const getLast7Days = () => {
        const days = []; const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today); date.setDate(date.getDate() - i);
            days.push({ date: date.toLocaleDateString().split('/').reverse().join('-'), dayName: date.toLocaleDateString('en-US', { weekday: 'short' }) });
        }
        return days;
    };
    const last7Days = getLast7Days();

    return (
        <TooltipProvider>
            <div className="flex gap-1">
                {last7Days.map(({ date, dayName }) => {
                    const isCompleted = habitTracker.some((tracker: any) => tracker.habitId === habit.id && tracker.status === 'completed' && tracker.date === date);
                    return (<Tooltip key={date}><TooltipTrigger><div className={cn("w-3 h-3 rounded-sm", isCompleted ? "bg-green-500 dark:bg-green-600" : "bg-muted")} /></TooltipTrigger><TooltipContent><p>{dayName}</p></TooltipContent></Tooltip>);
                })}
            </div>
        </TooltipProvider>
    )
}
