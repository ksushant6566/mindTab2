import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    startOfMonth,
    startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { Heading, MetaText } from "~/components/ui/typography";
import { cn } from "~/lib/utils";

type CalendarProps = {
    selected?: Date | null;
    onSelect?: (date: Date) => void;
    month?: Date;
    onMonthChange?: (date: Date) => void;
    className?: string;
};

export function Calendar({
    selected,
    onSelect,
    month,
    onMonthChange,
    className,
}: CalendarProps) {
    const [internalMonth, setInternalMonth] = React.useState(() => startOfMonth(month ?? selected ?? new Date()));
    const visibleMonth = startOfMonth(month ?? internalMonth);
    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(visibleMonth)),
        end: endOfWeek(endOfMonth(visibleMonth)),
    });

    const setMonth = (nextMonth: Date) => {
        setInternalMonth(startOfMonth(nextMonth));
        onMonthChange?.(startOfMonth(nextMonth));
    };

    return (
        <div className={cn("w-[284px] rounded-[var(--r-2)] border border-border bg-popover p-3 text-popover-foreground shadow-[var(--shadow-popover)]", className)}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <Heading as="div" variant="panel">{format(visibleMonth, "MMMM yyyy")}</Heading>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonth(addMonths(visibleMonth, -1))}
                        aria-label="Previous month"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setMonth(addMonths(visibleMonth, 1))}
                        aria-label="Next month"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                    <MetaText as="div" key={`${day}-${index}`} className="flex h-7 items-center justify-center">
                        {day}
                    </MetaText>
                ))}
                {days.map((day) => {
                    const selectedDay = selected && isSameDay(day, selected);
                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => onSelect?.(day)}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-[var(--r-2)] text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                !isSameMonth(day, visibleMonth) && "text-muted-foreground/60",
                                selectedDay && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                            )}
                            aria-pressed={!!selectedDay}
                        >
                            {format(day, "d")}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
