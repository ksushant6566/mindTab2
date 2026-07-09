import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMinutes, endOfDay, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
import { tasksQueryOptions, useCreateTask, useDeleteTask, useUpdateTask } from "~/api/hooks";
import { SkeletonBlock } from "~/components/patterns";
import { TaskDialog, type TaskDialogInput } from "~/components/tasks/task-dialog";
import { createEnabledScheduleDraft, getScheduleDraftPayload } from "~/components/tasks/task-schedule-fields";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { getStatusTone } from "~/lib/tones";
import { cn } from "~/lib/utils";
import {
    CalendarDayTimeline,
    type CalendarTimelineItem,
    type CalendarTimelineLayoutItem,
    formatCalendarTimeRange,
    getCalendarMinuteOfDay,
    getCalendarScheduleMinuteRange,
    normalizeCalendarSlot,
} from "./day-timeline";

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

type AgendaItem = CalendarTimelineItem<TaskRecord> & {
    task: TaskRecord;
    start: Date;
    end: Date;
};
type TimedAgendaItem = CalendarTimelineLayoutItem<AgendaItem>;

type CreateSlotState = { startAt: string; endAt: string } | null;

const DEFAULT_EVENT_DURATION_MINUTES = 60;
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
    const { schedules, scheduleTask } = useCalendarSchedules();
    const { setActiveElement, setActiveProjectId } = useAppStore();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<TaskRecord | null>(null);
    const [createSlot, setCreateSlot] = useState<CreateSlotState>(null);

    const { data: tasksData, isLoading } = useQuery(
        tasksQueryOptions({ includeArchived: true })
    );
    const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
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
    const currentMinute = getCalendarMinuteOfDay(now);
    const currentTimeTop = (currentMinute / 60) * TIMELINE_HOUR_HEIGHT;
    const createSlotScheduleDraft = useMemo(
        () => createSlot ? createEnabledScheduleDraft(parseISO(createSlot.startAt), parseISO(createSlot.endAt)) : undefined,
        [createSlot]
    );

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

    const openCreateTaskAtSlot = (hour: number) => {
        const start = normalizeCalendarSlot(dayStart, hour);
        const end = addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES);
        setCreateSlot({ startAt: start.toISOString(), endAt: end.toISOString() });
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

    const handleCreateTask = (task: TaskDialogInput) => {
        if (!createSlot) return;

        const { schedule, ...taskFields } = task;
        const taskData = { ...taskFields, status: "pending", projectId: null };
        const schedulePayload = getScheduleDraftPayload(schedule);
        const slot = createSlot;

        createTask(taskData, {
            onSuccess: (createdTask: any) => {
                const taskId = createdTask?.id;
                if (taskId && schedulePayload) {
                    scheduleTask(taskId, schedulePayload.startAt, schedulePayload.durationMinutes);
                    return;
                }

                if (taskId) {
                    const start = parseISO(slot.startAt);
                    const end = parseISO(slot.endAt);
                    scheduleTask(
                        taskId,
                        start,
                        Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
                    );
                }
            },
        });
        setCreateSlot(null);
    };

    useLayoutEffect(() => {
        if (isLoading || lastScrolledDayRef.current === selectedDayKey) return;

        const container = scrollRef.current;
        if (!container) return;

        const targetMinute = selectedDayIsToday
            ? currentMinute
            : todayItems[0]
                ? getCalendarScheduleMinuteRange(todayItems[0], dayStart).startMinute
                : 8 * 60;
        const targetTop = Math.max(0, ((targetMinute / 60) * TIMELINE_HOUR_HEIGHT) - container.clientHeight * 0.38);
        container.scrollTop = targetTop;
        lastScrolledDayRef.current = selectedDayKey;
    }, [currentMinute, dayStart, isLoading, selectedDayIsToday, selectedDayKey, todayItems]);

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
                {isLoading ? (
                    <div ref={scrollRef} className="custom-scrollbar min-h-0 w-[calc(100%+6px)] flex-1 overflow-x-hidden overflow-y-auto">
                        <SkeletonBlock className="h-full min-h-[360px]" />
                    </div>
                ) : (
                    <CalendarDayTimeline
                        scrollRef={scrollRef}
                        items={todayItems}
                        day={dayStart}
                        now={now}
                        showCurrentTime={selectedDayIsToday}
                        hourHeight={TIMELINE_HOUR_HEIGHT}
                        gutterWidth={TIMELINE_GUTTER_WIDTH}
                        minEventHeight={TIMELINE_MIN_EVENT_HEIGHT}
                        className="custom-scrollbar min-h-0 w-[calc(100%+6px)] flex-1 overflow-x-hidden overflow-y-auto"
                        timelineClassName="rounded-[var(--r-3)] border border-border bg-card/55"
                        timeLabelClassName="px-1.5"
                        slotClassName="bg-background/25 transition-colors group-hover/cell:bg-transparent"
                        getSlotAriaLabel={({ slotDate }) => `${format(dayStart, "MMMM d")} at ${format(slotDate, "h a")}, create scheduled task`}
                        onSlotClick={({ hour }) => openCreateTaskAtSlot(hour)}
                        renderSlotContent={({ items }) =>
                            items.length === 0 ? (
                                <div className="pointer-events-none flex h-full items-start justify-end opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100">
                                    <MetaText className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 shadow-sm">
                                        <Plus className="h-3 w-3" />
                                        Task
                                    </MetaText>
                                </div>
                            ) : null
                        }
                        renderEvent={(item) =>
                            <TodayTimelineEvent
                                key={item.schedule.taskId}
                                item={item}
                                dayStart={dayStart}
                                dayEnd={dayEnd}
                                onOpen={() => openTaskDialog(item.task)}
                            />
                        }
                        emptyState={
                            <div
                                className="pointer-events-none absolute inset-x-3 px-3 py-3 text-center"
                                style={{ top: Math.max(16, currentTimeTop + 18), left: TIMELINE_GUTTER_WIDTH + 8 }}
                            >
                                <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" />
                                <Heading as="div" variant="panel" className="mt-2">
                                    Nothing scheduled
                                </Heading>
                                <Text variant="muted" className="mt-1">
                                    Open Calendar to plan the day.
                                </Text>
                            </div>
                        }
                    />
                )}
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

            <TaskDialog
                mode="create"
                open={!!createSlot}
                onOpenChange={(open) => {
                    if (!open) setCreateSlot(null);
                }}
                onCreate={handleCreateTask}
                isSaving={isCreatingTask}
                defaultValues={{ status: "pending", projectId: null, schedule: createSlotScheduleDraft }}
            />
        </>
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
            aria-label={`${task.title || "Untitled task"}, ${tone.label}, ${formatCalendarTimeRange(start, end, { dayStart, dayEnd })}`}
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
                    {formatCalendarTimeRange(start, end, { dayStart, dayEnd })}
                </MetaText>
            ) : null}
        </button>
    );
}
