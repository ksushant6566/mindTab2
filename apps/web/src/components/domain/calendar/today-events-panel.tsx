import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfDay, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
import { tasksQueryOptions, useDeleteTask, useUpdateTask } from "~/api/hooks";
import { SkeletonBlock } from "~/components/patterns";
import { TaskDialog } from "~/components/tasks/task-dialog";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { type CalendarSchedule, useCalendarSchedules } from "~/lib/calendar-schedules";
import { getStatusTone } from "~/lib/tones";
import { cn } from "~/lib/utils";

type TaskRecord = {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    impact: string;
    position?: number | null;
    projectId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    completedAt?: string | null;
    project?: {
        id?: string | null;
        name?: string | null;
        status?: string | null;
    } | null;
    [key: string]: any;
};

type AgendaItem = {
    schedule: CalendarSchedule;
    task: TaskRecord;
    start: Date;
    end: Date;
};

type TimedAgendaItem = AgendaItem & {
    startMinute: number;
    endMinute: number;
    top: number;
    height: number;
    lane: number;
    laneCount: number;
};

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_HOUR_HEIGHT = 58;
const TIMELINE_GUTTER_WIDTH = 42;
const TIMELINE_EVENT_INSET_X = 5;
const TIMELINE_EVENT_INSET_Y = 5;
const TIMELINE_MIN_EVENT_HEIGHT = 34;

function getTaskProjectId(task?: TaskRecord | null) {
    return task?.projectId ?? task?.project?.id ?? null;
}

function isDone(task: TaskRecord) {
    return task.status === "completed" || task.status === "archived";
}

function overlapsDay(start: Date, end: Date, dayStart: Date, dayEnd: Date) {
    return start <= dayEnd && end >= dayStart;
}

function getMinuteOfDay(date: Date) {
    return date.getHours() * 60 + date.getMinutes();
}

function formatHour(hour: number) {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return format(date, "ha");
}

function formatAgendaTime(start: Date, end: Date, dayStart: Date, dayEnd: Date) {
    const crossesDayBoundary = start < dayStart || end > dayEnd;
    if (crossesDayBoundary) {
        return `${format(start, "EEE h:mm a")} - ${format(end, "EEE h:mm a")}`;
    }

    const samePeriod = format(start, "a") === format(end, "a");
    return samePeriod
        ? `${format(start, "h:mm")}-${format(end, "h:mm a")}`
        : `${format(start, "h:mm a")}-${format(end, "h:mm a")}`;
}

function getAgendaMinuteRange(item: AgendaItem, dayStart: Date, dayEnd: Date) {
    const startMinute = item.start < dayStart ? 0 : getMinuteOfDay(item.start);
    const rawEndMinute = item.end > dayEnd ? MINUTES_PER_DAY : getMinuteOfDay(item.end);
    const endMinute = Math.max(startMinute + 15, Math.min(MINUTES_PER_DAY, rawEndMinute || MINUTES_PER_DAY));

    return { startMinute, endMinute };
}

function layoutAgendaItems(items: AgendaItem[], dayStart: Date, dayEnd: Date): TimedAgendaItem[] {
    const sorted = items
        .map((item) => {
            const range = getAgendaMinuteRange(item, dayStart, dayEnd);
            return {
                ...item,
                ...range,
                top: (range.startMinute / 60) * TIMELINE_HOUR_HEIGHT,
                height: Math.max(
                    TIMELINE_MIN_EVENT_HEIGHT,
                    ((range.endMinute - range.startMinute) / 60) * TIMELINE_HOUR_HEIGHT
                ),
                lane: 0,
                laneCount: 1,
            };
        })
        .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

    const laidOut: TimedAgendaItem[] = [];
    let cluster: TimedAgendaItem[] = [];
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

function getTaskStatusStyle(task: TaskRecord): React.CSSProperties {
    const tone = getStatusTone(task.status);
    return {
        "--task-status-color": tone.tone,
        "--task-status-bg": tone.background,
        "--task-status-fg": tone.tone,
    } as React.CSSProperties;
}

function useMinuteNow() {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const interval = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(interval);
    }, []);

    return now;
}

export function TodayEventsPanel() {
    const now = useMinuteNow();
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lastScrolledDayRef = useRef<string | null>(null);
    const { schedules } = useCalendarSchedules();
    const { setActiveElement, setActiveProjectId } = useAppStore();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<TaskRecord | null>(null);

    const { data: tasksData, isLoading } = useQuery(
        tasksQueryOptions({ includeArchived: true })
    );
    const { mutate: updateTask, isPending: isUpdatingTask } = useUpdateTask();
    const { mutate: deleteTask, isPending: isDeletingTask, variables: deleteTaskVariables } = useDeleteTask();

    const tasks = useMemo(() => ((tasksData as TaskRecord[]) ?? []), [tasksData]);
    const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
    const dayStart = useMemo(() => startOfDay(selectedDate), [selectedDate]);
    const dayEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);
    const selectedDayKey = useMemo(() => format(dayStart, "yyyy-MM-dd"), [dayStart]);
    const selectedDayIsToday = isSameDay(dayStart, now);

    const todayItems = useMemo(() => {
        return Object.values(schedules)
            .map((schedule) => {
                const task = taskById.get(schedule.taskId);
                if (!task) return null;

                const start = parseISO(schedule.startAt);
                const end = parseISO(schedule.endAt);
                if (!overlapsDay(start, end, dayStart, dayEnd)) return null;

                return { schedule, task, start, end };
            })
            .filter((item): item is AgendaItem => Boolean(item))
            .sort((left, right) => left.start.getTime() - right.start.getTime());
    }, [dayEnd, dayStart, schedules, taskById]);
    const timedItems = useMemo(
        () => layoutAgendaItems(todayItems, dayStart, dayEnd),
        [dayEnd, dayStart, todayItems]
    );
    const currentMinute = getMinuteOfDay(now);
    const currentTimeTop = (currentMinute / 60) * TIMELINE_HOUR_HEIGHT;
    const markerTop = selectedDayIsToday ? currentTimeTop : null;
    const timelineHeight = HOURS.length * TIMELINE_HOUR_HEIGHT;

    const currentSelectedTask = useMemo(() => {
        if (!selectedTaskId) return null;
        const taskFromQuery = taskById.get(selectedTaskId) ?? null;
        if (selectedTaskSnapshot?.id === selectedTaskId) {
            return { ...(taskFromQuery ?? {}), ...selectedTaskSnapshot };
        }
        return taskFromQuery;
    }, [selectedTaskId, selectedTaskSnapshot, taskById]);

    const openTaskDialog = (task: TaskRecord) => {
        setSelectedTaskSnapshot(task);
        setSelectedTaskId(task.id);
    };

    const openCalendar = () => {
        setActiveProjectId(null);
        setActiveElement(EActiveLayout.Calendar);
    };

    const handleUpdateTask = (taskId: string, values: Record<string, unknown>) => {
        const existingTask = taskById.get(taskId);
        const sanitizedTask = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
        if (existingTask && !("projectId" in sanitizedTask)) {
            sanitizedTask.projectId = getTaskProjectId(existingTask);
        }
        updateTask({ ...sanitizedTask, id: taskId } as { id: string; title?: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string | null });
        setSelectedTaskSnapshot((current) => current?.id === taskId ? { ...current, ...sanitizedTask } : current);
    };

    const handleDeleteTask = (taskId: string) => {
        deleteTask(taskId);
        if (selectedTaskId === taskId) {
            setSelectedTaskId(null);
            setSelectedTaskSnapshot(null);
        }
    };

    useLayoutEffect(() => {
        if (isLoading || lastScrolledDayRef.current === selectedDayKey) return;

        const container = scrollRef.current;
        if (!container) return;

        const targetMinute = selectedDayIsToday
            ? currentMinute
            : timedItems[0]?.startMinute ?? 8 * 60;
        const targetTop = Math.max(0, ((targetMinute / 60) * TIMELINE_HOUR_HEIGHT) - container.clientHeight * 0.38);
        container.scrollTop = targetTop;
        lastScrolledDayRef.current = selectedDayKey;
    }, [currentMinute, isLoading, selectedDayIsToday, selectedDayKey, timedItems]);

    return (
        <>
            <div className="flex min-h-0 flex-col">
                <div className="mb-2 flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-[var(--r-3)] border border-border bg-card/55 px-1.5 py-1">
                    <div className="flex min-w-0 items-center justify-start gap-2">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            title="Previous day"
                            aria-label="Previous day"
                            onClick={() => setSelectedDate((date) => addDays(date, -1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Heading as="div" variant="section" className="min-w-[88px] truncate text-center">
                            {format(dayStart, "d, MMMM")}
                        </Heading>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            title="Next day"
                            aria-label="Next day"
                            onClick={() => setSelectedDate((date) => addDays(date, 1))}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <TooltipProvider>
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0"
                                    aria-label="Open calendar view"
                                    onClick={openCalendar}
                                >
                                    <CalendarDays className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Open calendar view</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <div ref={scrollRef} className="custom-scrollbar min-h-0 w-[calc(100%+6px)] flex-1 overflow-x-hidden overflow-y-auto">
                    {isLoading ? (
                        <SkeletonBlock className="h-full min-h-[360px]" />
                    ) : (
                        <TodayTimeline
                            items={timedItems}
                            nowTop={markerTop}
                            timelineHeight={timelineHeight}
                            dayStart={dayStart}
                            dayEnd={dayEnd}
                            onOpenTask={openTaskDialog}
                        />
                    )}
                </div>
            </div>

            {selectedTaskId && currentSelectedTask ? (
                <TaskDialog
                    mode="view"
                    open={!!selectedTaskId}
                    onOpenChange={(open: boolean) => {
                        if (!open) {
                            setSelectedTaskId(null);
                            setSelectedTaskSnapshot(null);
                        }
                    }}
                    task={currentSelectedTask}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                    isSaving={isUpdatingTask}
                    isDeleting={isDeletingTask}
                    deleteVariables={deleteTaskVariables}
                />
            ) : null}
        </>
    );
}

function TodayTimeline({
    items,
    nowTop,
    timelineHeight,
    dayStart,
    dayEnd,
    onOpenTask,
}: {
    items: TimedAgendaItem[];
    nowTop: number | null;
    timelineHeight: number;
    dayStart: Date;
    dayEnd: Date;
    onOpenTask: (task: TaskRecord) => void;
}) {
    return (
        <div
            className="relative overflow-hidden rounded-[var(--r-3)] border border-border bg-card/55"
            style={{ height: timelineHeight }}
        >
            {HOURS.map((hour) => (
                <div
                    key={hour}
                    className="grid border-b border-border/75 last:border-b-0"
                    style={{ height: TIMELINE_HOUR_HEIGHT, gridTemplateColumns: `${TIMELINE_GUTTER_WIDTH}px minmax(0, 1fr)` }}
                >
                    <MetaText as="div" className="border-r border-border px-1.5 py-2 text-right">
                        {formatHour(hour)}
                    </MetaText>
                    <div className="bg-background/25" />
                </div>
            ))}

            {nowTop !== null ? (
                <div
                    className="pointer-events-none absolute right-0 z-20 h-px bg-[var(--tone-calendar-now)]"
                    style={{ top: nowTop, left: TIMELINE_GUTTER_WIDTH }}
                >
                    <span className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tone-calendar-now)]" />
                </div>
            ) : null}

            <div
                className="pointer-events-none absolute right-0 top-0 z-10"
                style={{ left: TIMELINE_GUTTER_WIDTH, height: timelineHeight }}
            >
                {items.map((item) => (
                    <TodayTimelineEvent
                        key={item.schedule.taskId}
                        item={item}
                        dayStart={dayStart}
                        dayEnd={dayEnd}
                        onOpen={() => onOpenTask(item.task)}
                    />
                ))}
            </div>

            {items.length === 0 ? (
                <div
                    className="pointer-events-none absolute inset-x-3 px-3 py-3 text-center"
                    style={{ top: Math.max(16, (nowTop ?? TIMELINE_HOUR_HEIGHT * 8) + 18), left: TIMELINE_GUTTER_WIDTH + 8 }}
                >
                    <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" />
                    <Heading as="div" variant="panel" className="mt-2">
                        Nothing scheduled
                    </Heading>
                    <Text variant="muted" className="mt-1">
                        Open Calendar to plan the day.
                    </Text>
                </div>
            ) : null}
        </div>
    );
}

function TodayTimelineEvent({
    item,
    dayStart,
    dayEnd,
    onOpen,
}: {
    item: TimedAgendaItem;
    dayStart: Date;
    dayEnd: Date;
    onOpen: () => void;
}) {
    const { task, start, end, lane, laneCount, top, height } = item;
    const completed = isDone(task);
    const tone = getStatusTone(task.status);
    const laneGap = 4;
    const width = `calc((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount})`;
    const left = `calc(${lane} * ((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount} + ${laneGap}px))`;
    const eventHeight = Math.max(TIMELINE_MIN_EVENT_HEIGHT, height - TIMELINE_EVENT_INSET_Y * 2);
    const roomy = eventHeight >= 44;

    return (
        <button
            type="button"
            className={cn(
                "pointer-events-auto absolute overflow-hidden rounded-[var(--r-2)] border px-2.5 py-1.5 text-left text-foreground shadow-[inset_3px_0_0_var(--task-status-color)] transition-colors",
                "bg-[var(--task-status-bg)] hover:bg-[var(--bg-elev)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                completed && "text-muted-foreground"
            )}
            style={{
                ...getTaskStatusStyle(task),
                top: top + TIMELINE_EVENT_INSET_Y,
                height: eventHeight,
                left: `calc(${left} + ${TIMELINE_EVENT_INSET_X}px)`,
                width: `calc(${width} - ${TIMELINE_EVENT_INSET_X * 2}px)`,
            }}
            onClick={onOpen}
            aria-label={`${task.title || "Untitled task"}, ${tone.label}, ${formatAgendaTime(start, end, dayStart, dayEnd)}`}
            aria-haspopup="dialog"
        >
            <Text
                as="div"
                variant="body"
                className={cn(
                    "min-w-0 truncate",
                    completed && "line-through decoration-[var(--task-status-color)]/70"
                )}
            >
                {task.title || "Untitled task"}
            </Text>
            {roomy ? (
                <MetaText
                    as="div"
                    className="mt-0.5 truncate"
                    style={{ color: "var(--task-status-fg)" }}
                >
                    {formatAgendaTime(start, end, dayStart, dayEnd)}
                </MetaText>
            ) : null}
        </button>
    );
}
