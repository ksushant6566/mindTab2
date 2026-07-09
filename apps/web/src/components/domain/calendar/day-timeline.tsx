import * as React from "react";
import { format, isSameDay, parseISO, startOfDay, endOfDay } from "date-fns";
import { MetaText } from "~/components/ui/typography";
import { type CalendarSchedule } from "~/lib/calendar-schedules";
import { cn } from "~/lib/utils";
import { CalendarGridCell } from "./primitives";

export type CalendarTimelineItem<TTask = unknown> = {
    schedule: CalendarSchedule;
    task?: TTask;
    start?: Date;
    end?: Date;
};

export type CalendarTimelineLayoutItem<TItem extends CalendarTimelineItem = CalendarTimelineItem> = TItem & {
    start: Date;
    end: Date;
    startMinute: number;
    endMinute: number;
    top: number;
    height: number;
    lane: number;
    laneCount: number;
};

type CalendarTimelineSlotContext<TItem extends CalendarTimelineItem> = {
    day: Date;
    hour: number;
    slotDate: Date;
    targetKey: string;
    items: TItem[];
};

type CalendarDayTimelineProps<TItem extends CalendarTimelineItem> = {
    day: Date;
    items: TItem[];
    now?: Date;
    showCurrentTime?: boolean;
    hourHeight: number;
    gutterWidth: number;
    minEventHeight: number;
    className?: string;
    timelineClassName?: string;
    rowClassName?: string;
    timeLabelClassName?: string;
    slotClassName?: string | ((context: CalendarTimelineSlotContext<TItem>) => string | undefined);
    style?: React.CSSProperties;
    slotStyle?: React.CSSProperties;
    eventOverlayClassName?: string;
    scrollRef?: React.Ref<HTMLDivElement>;
    renderEvent: (item: CalendarTimelineLayoutItem<TItem>) => React.ReactNode;
    renderSlotContent?: (context: CalendarTimelineSlotContext<TItem>) => React.ReactNode;
    getSlotAriaLabel?: (context: CalendarTimelineSlotContext<TItem>) => string;
    onSlotClick?: (context: CalendarTimelineSlotContext<TItem>) => void;
    onSlotDragEnter?: (context: CalendarTimelineSlotContext<TItem>) => void;
    onSlotDragLeave?: (context: CalendarTimelineSlotContext<TItem>) => void;
    onSlotDragOver?: (event: React.DragEvent<HTMLDivElement>, context: CalendarTimelineSlotContext<TItem>) => void;
    onSlotDrop?: (event: React.DragEvent<HTMLDivElement>, context: CalendarTimelineSlotContext<TItem>) => void;
    emptyState?: React.ReactNode;
};

export const CALENDAR_TIMELINE_HOURS = Array.from({ length: 24 }, (_, index) => index);
export const CALENDAR_TIMELINE_MINUTES_PER_DAY = 24 * 60;

export function getCalendarMinuteOfDay(date: Date) {
    return date.getHours() * 60 + date.getMinutes();
}

export function normalizeCalendarSlot(date: Date, hour: number, minute = 0) {
    const next = new Date(date);
    next.setHours(hour, minute, 0, 0);
    return next;
}

export function formatCalendarHour(hour: number) {
    return format(normalizeCalendarSlot(new Date(), hour), "ha");
}

export function formatCalendarTimeRange(
    startAt: string | Date,
    endAt: string | Date,
    options: { dayStart?: Date; dayEnd?: Date } = {}
) {
    const start = typeof startAt === "string" ? parseISO(startAt) : startAt;
    const end = typeof endAt === "string" ? parseISO(endAt) : endAt;
    const { dayStart, dayEnd } = options;

    if (dayStart && dayEnd && (start < dayStart || end > dayEnd)) {
        return `${format(start, "EEE h:mm a")} - ${format(end, "EEE h:mm a")}`;
    }

    const samePeriod = format(start, "a") === format(end, "a");
    return samePeriod
        ? `${format(start, "h:mm")}-${format(end, "h:mm a")}`
        : `${format(start, "h:mm a")}-${format(end, "h:mm a")}`;
}

export function getCalendarScheduleMinuteRange(
    item: CalendarTimelineItem,
    day: Date,
    minimumMinutes = 15
) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const start = item.start ?? parseISO(item.schedule.startAt);
    const end = item.end ?? parseISO(item.schedule.endAt);
    const startMinute = start < dayStart ? 0 : getCalendarMinuteOfDay(start);
    const rawEndMinute = end > dayEnd ? CALENDAR_TIMELINE_MINUTES_PER_DAY : getCalendarMinuteOfDay(end);
    const endMinute = Math.max(
        startMinute + minimumMinutes,
        Math.min(CALENDAR_TIMELINE_MINUTES_PER_DAY, rawEndMinute || CALENDAR_TIMELINE_MINUTES_PER_DAY)
    );

    return { start, end, startMinute, endMinute };
}

export function layoutCalendarTimelineItems<TItem extends CalendarTimelineItem>(
    items: TItem[],
    day: Date,
    hourHeight: number,
    minEventHeight: number,
    minimumMinutes = 15
): CalendarTimelineLayoutItem<TItem>[] {
    const sorted = items
        .map((item) => {
            const range = getCalendarScheduleMinuteRange(item, day, minimumMinutes);
            return {
                ...item,
                ...range,
                top: (range.startMinute / 60) * hourHeight,
                height: Math.max(minEventHeight, ((range.endMinute - range.startMinute) / 60) * hourHeight),
                lane: 0,
                laneCount: 1,
            };
        })
        .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

    const laidOut: CalendarTimelineLayoutItem<TItem>[] = [];
    let cluster: CalendarTimelineLayoutItem<TItem>[] = [];
    let clusterEnd = -1;

    const flushCluster = () => {
        if (cluster.length === 0) return;

        const laneEnds: number[] = [];
        for (const item of cluster) {
            const lane = laneEnds.findIndex((endMinute) => endMinute <= item.startMinute);
            const nextLane = lane >= 0 ? lane : laneEnds.length;
            laneEnds[nextLane] = item.endMinute;
            item.lane = nextLane;
        }

        const laneCount = Math.max(1, laneEnds.length);
        for (const item of cluster) {
            laidOut.push({ ...item, laneCount });
        }

        cluster = [];
        clusterEnd = -1;
    };

    for (const item of sorted) {
        if (cluster.length > 0 && item.startMinute >= clusterEnd) {
            flushCluster();
        }

        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinute);
    }

    flushCluster();
    return laidOut;
}

function getHourItems<TItem extends CalendarTimelineItem>(items: TItem[], day: Date, hour: number) {
    return items.filter((item) => {
        const start = item.start ?? parseISO(item.schedule.startAt);
        return isSameDay(start, day) && start.getHours() === hour;
    });
}

export function CalendarDayTimeline<TItem extends CalendarTimelineItem>({
    day,
    items,
    now,
    showCurrentTime = now ? isSameDay(day, now) : false,
    hourHeight,
    gutterWidth,
    minEventHeight,
    className,
    timelineClassName,
    rowClassName,
    timeLabelClassName,
    slotClassName,
    style,
    slotStyle,
    eventOverlayClassName,
    scrollRef,
    renderEvent,
    renderSlotContent,
    getSlotAriaLabel,
    onSlotClick,
    onSlotDragEnter,
    onSlotDragLeave,
    onSlotDragOver,
    onSlotDrop,
    emptyState,
}: CalendarDayTimelineProps<TItem>) {
    const timelineHeight = CALENDAR_TIMELINE_HOURS.length * hourHeight;
    const nowTop = now && showCurrentTime ? (getCalendarMinuteOfDay(now) / 60) * hourHeight : null;
    const laidOutItems = layoutCalendarTimelineItems(items, day, hourHeight, minEventHeight);

    return (
        <div ref={scrollRef} className={className} style={style}>
            <div
                className={cn("relative overflow-hidden", timelineClassName)}
                style={{ height: timelineHeight }}
            >
                {CALENDAR_TIMELINE_HOURS.map((hour) => {
                    const slotDate = normalizeCalendarSlot(day, hour);
                    const targetKey = `${day.toISOString()}-${hour}`;
                    const context: CalendarTimelineSlotContext<TItem> = {
                        day,
                        hour,
                        slotDate,
                        targetKey,
                        items: getHourItems(items, day, hour),
                    };
                    const resolvedSlotClassName =
                        typeof slotClassName === "function" ? slotClassName(context) : slotClassName;

                    return (
                        <div
                            key={hour}
                            className={cn("grid min-h-0 overflow-hidden border-b border-border/75 last:border-b-0", rowClassName)}
                            style={{ height: hourHeight, gridTemplateColumns: `${gutterWidth}px minmax(0, 1fr)` }}
                        >
                            <MetaText as="div" className={cn("border-r border-border px-2 py-2 text-right", timeLabelClassName)}>
                                {formatCalendarHour(hour)}
                            </MetaText>
                            <CalendarGridCell
                                role={onSlotClick ? "button" : undefined}
                                tabIndex={onSlotClick ? 0 : undefined}
                                aria-label={getSlotAriaLabel?.(context)}
                                onClick={() => onSlotClick?.(context)}
                                onKeyDown={(event) => {
                                    if (!onSlotClick || (event.key !== "Enter" && event.key !== " ")) return;
                                    event.preventDefault();
                                    onSlotClick(context);
                                }}
                                onDragEnter={() => onSlotDragEnter?.(context)}
                                onDragLeave={() => onSlotDragLeave?.(context)}
                                onDragOver={(event) => onSlotDragOver?.(event, context)}
                                onDrop={(event) => onSlotDrop?.(event, context)}
                                className={cn(
                                    "group/cell relative min-h-0 cursor-pointer overflow-hidden border-b-0 border-r-0 p-1.5 transition-colors hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                                    resolvedSlotClassName
                                )}
                                style={{ height: hourHeight, ...slotStyle }}
                            >
                                {renderSlotContent?.(context)}
                            </CalendarGridCell>
                        </div>
                    );
                })}

                {nowTop !== null ? (
                    <div
                        className="pointer-events-none absolute right-0 z-20 h-px bg-[var(--tone-calendar-now)]"
                        style={{ top: nowTop, left: gutterWidth }}
                    >
                        <span className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tone-calendar-now)]" />
                    </div>
                ) : null}

                <div
                    className={cn("pointer-events-none absolute right-0 top-0 z-10", eventOverlayClassName)}
                    style={{ left: gutterWidth, height: timelineHeight }}
                >
                    {laidOutItems.map((item) => renderEvent(item))}
                </div>

                {items.length === 0 ? emptyState : null}
            </div>
        </div>
    );
}
