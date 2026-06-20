import {
    addMinutes,
    addDays,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from "date-fns";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Link2Off,
    Plus,
} from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@mindtab/core";
import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    tasksQueryOptions,
    useCreateTask,
    useDeleteTask,
    useUpdateTask,
} from "~/api/hooks";
import { TaskDialog, type TaskDialogInput } from "~/components/tasks/task-dialog";
import { createEnabledScheduleDraft, getScheduleDraftPayload } from "~/components/tasks/task-schedule-fields";
import { Task } from "~/components/tasks/task";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { type CalendarSchedule, useCalendarSchedules } from "~/lib/calendar-schedules";
import { cn } from "~/lib/utils";

type CalendarView = "day" | "week" | "month";

type TaskRecord = {
    id: string;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    priority?: string | null;
    impact?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    projectId?: string | null;
    project?: {
        id?: string | null;
        name?: string | null;
    } | null;
};

type ScheduledItem = { schedule: CalendarSchedule; task?: TaskRecord };
type TimedLayoutItem = ScheduledItem & {
    startMinute: number;
    endMinute: number;
    top: number;
    height: number;
    lane: number;
    laneCount: number;
};
type DetailDialogState =
    | { kind: "day"; dateIso: string }
    | { kind: "slot"; dateIso: string; hour: number }
    | null;
type CreateSlotState = { startAt: string; endAt: string } | null;

const CALENDAR_VIEW_STORAGE_KEY = "mindtab-calendar-view";
const DEFAULT_EVENT_DURATION_MINUTES = 60;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES_PER_DAY = 24 * 60;
const SNAP_MINUTES = 15;
const MIN_TIMED_EVENT_HEIGHT = 28;
const MIN_TIMED_EVENT_RENDER_HEIGHT = 24;
const TIMED_EVENT_INSET_X = 6;
const TIMED_EVENT_INSET_Y = 5;
const TIME_ROW_HEIGHT = 74;
const VIEW_LABELS: Array<{ value: CalendarView; label: string }> = [
    { value: "day", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

function getTaskTone() {
    return "border-[var(--border-2)] bg-[var(--bg-soft)] text-foreground";
}

function getTaskProjectId(task: TaskRecord) {
    return task.projectId ?? task.project?.id ?? null;
}

function normalizeSlot(date: Date, hour: number, minute = 0) {
    const next = new Date(date);
    next.setHours(hour, minute, 0, 0);
    return next;
}

function formatTimeRange(startAt: string | Date, endAt: string | Date) {
    const start = typeof startAt === "string" ? parseISO(startAt) : startAt;
    const end = typeof endAt === "string" ? parseISO(endAt) : endAt;
    return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

function getVisibleDays(view: CalendarView, anchorDate: Date) {
    if (view === "day") return [startOfDay(anchorDate)];
    if (view === "week") {
        const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
        return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }

    return eachDayOfInterval({
        start: startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 }),
    });
}

function getRangeLabel(view: CalendarView, anchorDate: Date) {
    if (view === "day") return format(anchorDate, "EEEE, MMMM d");
    if (view === "week") {
        const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
        const end = addDays(start, 6);
        return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
    }
    return format(anchorDate, "MMMM yyyy");
}

function moveAnchor(view: CalendarView, anchorDate: Date, direction: -1 | 1) {
    if (view === "day") return addDays(anchorDate, direction);
    if (view === "week") return addDays(anchorDate, direction * 7);
    const next = new Date(anchorDate);
    next.setMonth(anchorDate.getMonth() + direction);
    return next;
}

function getStoredCalendarView(): CalendarView {
    if (typeof window === "undefined") return "week";
    const stored = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    return stored === "day" || stored === "week" || stored === "month" ? stored : "week";
}

function getScheduleMinuteRange(schedule: CalendarSchedule) {
    const start = parseISO(schedule.startAt);
    const end = parseISO(schedule.endAt);
    const startMinute = Math.max(0, Math.min(MINUTES_PER_DAY, start.getHours() * 60 + start.getMinutes()));
    const rawEndMinute = isSameDay(start, end) ? end.getHours() * 60 + end.getMinutes() : MINUTES_PER_DAY;
    const endMinute = Math.max(startMinute + SNAP_MINUTES, Math.min(MINUTES_PER_DAY, rawEndMinute));

    return { startMinute, endMinute };
}

function roundToNearestSnap(minute: number) {
    return Math.max(0, Math.min(45, Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES));
}

function getDropMinute(event: React.DragEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : 0;
    return roundToNearestSnap(ratio * 60);
}

function layoutTimedItems(items: ScheduledItem[]): TimedLayoutItem[] {
    const sorted = items
        .map((item) => {
            const range = getScheduleMinuteRange(item.schedule);
            return {
                ...item,
                ...range,
                top: (range.startMinute / 60) * TIME_ROW_HEIGHT,
                height: Math.max(MIN_TIMED_EVENT_HEIGHT, ((range.endMinute - range.startMinute) / 60) * TIME_ROW_HEIGHT),
                lane: 0,
                laneCount: 1,
            };
        })
        .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

    const laidOut: TimedLayoutItem[] = [];
    let cluster: TimedLayoutItem[] = [];
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

export function Calendar() {
    const [view, setView] = useState<CalendarView>(() => getStoredCalendarView());
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [detailDialog, setDetailDialog] = useState<DetailDialogState>(null);
    const [createSlot, setCreateSlot] = useState<CreateSlotState>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [timeGridGutter, setTimeGridGutter] = useState(0);
    const timeGridScrollRef = useRef<HTMLDivElement | null>(null);
    const { schedules, setSchedule, scheduleTask, unscheduleTask } = useCalendarSchedules();
    const { activeProjectId } = useAppStore();
    const { data: tasksData, isLoading } = useQuery(
        tasksQueryOptions(activeProjectId ? { projectId: activeProjectId, includeArchived: false } : { includeArchived: false })
    );
    const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
    const { mutate: updateTask } = useUpdateTask();
    const {
        mutate: deleteTask,
        isPending: isDeletingTask,
        variables: deleteTaskVariables,
    } = useDeleteTask();

    const tasks = useMemo(() => ((tasksData as TaskRecord[]) ?? []).filter((task) => task.status !== "archived"), [tasksData]);
    const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
    const visibleDays = useMemo(() => getVisibleDays(view, anchorDate), [anchorDate, view]);

    const scheduledItems = useMemo(
        () =>
            Object.values(schedules)
                .map((schedule) => ({ schedule, task: taskById.get(schedule.taskId) }))
                .filter((item) => item.task)
                .sort((a, b) => parseISO(a.schedule.startAt).getTime() - parseISO(b.schedule.startAt).getTime()),
        [schedules, taskById]
    );

    const unscheduledTasks = useMemo(
        () => tasks.filter((task) => !schedules[task.id] && task.status !== "completed"),
        [schedules, tasks]
    );
    const monthRows = Math.ceil(visibleDays.length / 7);
    const detailItems = useMemo(() => {
        if (!detailDialog) return [];
        const date = parseISO(detailDialog.dateIso);
        return scheduledItems.filter(({ schedule }) => {
            const start = parseISO(schedule.startAt);
            if (!isSameDay(start, date)) return false;
            return detailDialog.kind === "day" || start.getHours() === detailDialog.hour;
        });
    }, [detailDialog, scheduledItems]);
    const detailTitle = detailDialog
        ? detailDialog.kind === "day"
            ? format(parseISO(detailDialog.dateIso), "EEEE, MMMM d")
            : `${format(parseISO(detailDialog.dateIso), "EEEE, MMMM d")} at ${format(normalizeSlot(parseISO(detailDialog.dateIso), detailDialog.hour), "h a")}`
        : "Scheduled tasks";
    const detailDescription = `${detailItems.length} scheduled ${detailItems.length === 1 ? "task" : "tasks"}`;
    const todayIndex = visibleDays.findIndex((day) => isToday(day));
    const currentMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
    const currentTimeTop = (currentMinute / 60) * TIME_ROW_HEIGHT;
    const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) : null;
    const createSlotScheduleDraft = useMemo(
        () => createSlot ? createEnabledScheduleDraft(parseISO(createSlot.startAt), parseISO(createSlot.endAt)) : undefined,
        [createSlot]
    );

    useEffect(() => {
        window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
    }, [view]);

    useEffect(() => {
        const interval = window.setInterval(() => setCurrentTime(new Date()), 30_000);
        return () => window.clearInterval(interval);
    }, []);

    useLayoutEffect(() => {
        if (view === "month") return;
        const container = timeGridScrollRef.current;
        if (!container) return;

        const measureGutter = () => {
            setTimeGridGutter(Math.max(0, container.offsetWidth - container.clientWidth));
        };

        measureGutter();

        const resizeObserver = new ResizeObserver(measureGutter);
        resizeObserver.observe(container);
        window.addEventListener("resize", measureGutter);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", measureGutter);
        };
    }, [view]);

    useEffect(() => {
        if (view === "month" || todayIndex < 0) return;

        const frame = window.requestAnimationFrame(() => {
            const container = timeGridScrollRef.current;
            if (!container) return;

            const targetTop = Math.max(0, currentTimeTop - TIME_ROW_HEIGHT * 2);
            container.scrollTo({ top: targetTop, behavior: "auto" });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [anchorDate, todayIndex, view]);

    const handleDrop = (event: React.DragEvent<HTMLElement>, date: Date, hour?: number) => {
        event.preventDefault();
        setDragTarget(null);
        const taskId = event.dataTransfer.getData("text/plain");
        if (!taskId) return;
        if (hour === undefined) {
            scheduleTask(taskId, normalizeSlot(date, 9), DEFAULT_EVENT_DURATION_MINUTES);
            return;
        }

        const start = normalizeSlot(date, hour, getDropMinute(event));
        setSchedule(taskId, start, addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES));
    };

    const openDayDetails = (day: Date) => {
        setDetailDialog({ kind: "day", dateIso: startOfDay(day).toISOString() });
    };

    const openSlotDetails = (day: Date, hour: number) => {
        setDetailDialog({ kind: "slot", dateIso: startOfDay(day).toISOString(), hour });
    };

    const openCreateTaskAtSlot = (day: Date, hour: number) => {
        const start = normalizeSlot(day, hour);
        const end = addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES);
        setCreateSlot({ startAt: start.toISOString(), endAt: end.toISOString() });
    };

    const openCreateTaskAtDate = (day: Date) => {
        const start = normalizeSlot(day, 9);
        const end = addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES);
        setCreateSlot({ startAt: start.toISOString(), endAt: end.toISOString() });
    };

    const openCreateTaskNextHour = () => {
        const start = new Date();
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() + 1);
        setCreateSlot({
            startAt: start.toISOString(),
            endAt: addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES).toISOString(),
        });
    };

    const openCreateTaskFromDetails = () => {
        if (!detailDialog) return;
        const start = detailDialog.kind === "slot"
            ? normalizeSlot(parseISO(detailDialog.dateIso), detailDialog.hour)
            : normalizeSlot(parseISO(detailDialog.dateIso), 9);
        const end = addMinutes(start, DEFAULT_EVENT_DURATION_MINUTES);
        setCreateSlot({ startAt: start.toISOString(), endAt: end.toISOString() });
        setDetailDialog(null);
    };

    const jumpToDetailDay = () => {
        if (!detailDialog) return;
        setAnchorDate(parseISO(detailDialog.dateIso));
        setView("day");
        setDetailDialog(null);
    };

    const handleDeleteTask = (taskId: string) => {
        deleteTask(taskId);
    };

    const handleEditTask = (_taskId: string) => {
        // The shared Task component owns its click/edit dialog when onUpdate is provided.
    };

    const handleToggleTaskStatus = (taskId: string, _checked: CheckedState) => {
        const task = tasks.find((item) => item.id === taskId);
        if (!task) return;

        let nextStatus: string;
        if (task.status === "pending") nextStatus = "in_progress";
        else if (task.status === "in_progress") nextStatus = "completed";
        else nextStatus = "pending";

        updateTask({
            id: taskId,
            title: task.title ?? undefined,
            description: task.description ?? undefined,
            status: nextStatus,
            priority: task.priority ?? undefined,
            impact: task.impact ?? undefined,
            projectId: getTaskProjectId(task),
        });
    };

    const handleUpdateTask = (taskId: string, task: Record<string, unknown>) => {
        const existingTask = tasks.find((item) => item.id === taskId);
        const sanitizedTask = Object.fromEntries(Object.entries(task).filter(([, value]) => value !== undefined));
        if (existingTask && !("projectId" in sanitizedTask)) {
            sanitizedTask.projectId = getTaskProjectId(existingTask);
        }
        updateTask({ ...sanitizedTask, id: taskId } as {
            id: string;
            title?: string;
            description?: string;
            status?: string;
            priority?: string;
            impact?: string;
            position?: number;
            projectId?: string | null;
            completedAt?: string | null;
        });
    };

    const handleCreateTask = (task: TaskDialogInput) => {
        if (!createSlot) return;

        const { schedule, ...taskFields } = task;
        const taskData = activeProjectId ? { ...taskFields, status: "pending", projectId: activeProjectId } : { ...taskFields, status: "pending" };
        const schedulePayload = getScheduleDraftPayload(schedule);
        const slot = createSlot;
        createTask(taskData, {
            onSuccess: (createdTask: any) => {
                const taskId = createdTask?.id;
                if (taskId && schedulePayload) {
                    scheduleTask(taskId, schedulePayload.startAt, schedulePayload.durationMinutes);
                } else if (taskId) {
                    const start = parseISO(slot.startAt);
                    const end = parseISO(slot.endAt);
                    scheduleTask(taskId, start, Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)));
                }
            },
        });
        setCreateSlot(null);
    };

    const openTaskDialog = (taskId: string) => {
        setSelectedTaskId(taskId);
        setDetailDialog(null);
    };

    const renderMonthEvent = (schedule: CalendarSchedule, task?: TaskRecord) => {
        const start = parseISO(schedule.startAt);
        const end = parseISO(schedule.endAt);
        return (
            <button
                key={schedule.taskId}
                type="button"
                draggable
                title={`${task?.title || "Untitled task"} · ${formatTimeRange(start, end)}`}
                aria-label={`${task?.title || "Untitled task"}, ${formatTimeRange(start, end)}`}
                onClick={(event) => {
                    event.stopPropagation();
                    openTaskDialog(schedule.taskId);
                }}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", schedule.taskId)}
                className={cn(
                    "group/event flex h-[18px] w-full cursor-grab items-center rounded-[var(--r-2)] border px-1.5 text-left",
                    "overflow-hidden transition-colors hover:bg-[var(--bg-elev)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    getTaskTone()
                )}
            >
                <span className="truncate text-[10px] font-semibold leading-3.5">{task?.title || "Untitled task"}</span>
            </button>
        );
    };

    const renderTimedEvent = (item: TimedLayoutItem) => {
        const { schedule, task, lane, laneCount, top, height } = item;
        const start = parseISO(schedule.startAt);
        const end = parseISO(schedule.endAt);
        const laneGap = 4;
        const width = `calc((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount})`;
        const left = `calc(${lane} * ((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount} + ${laneGap}px))`;
        const renderedHeight = Math.max(MIN_TIMED_EVENT_RENDER_HEIGHT, height - TIMED_EVENT_INSET_Y * 2);
        const roomy = height >= 46;

        return (
            <div
                key={schedule.taskId}
                role="button"
                tabIndex={0}
                draggable
                title={`${task?.title || "Untitled task"} · ${formatTimeRange(start, end)}`}
                aria-label={`${task?.title || "Untitled task"}, ${formatTimeRange(start, end)}`}
                onClick={(event) => {
                    event.stopPropagation();
                    openTaskDialog(schedule.taskId);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTaskDialog(schedule.taskId);
                    }
                }}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", schedule.taskId)}
                className={cn(
                    "group/event pointer-events-auto absolute z-10 cursor-grab overflow-hidden rounded-[var(--r-2)] border px-2 py-1 text-left",
                    "transition-colors hover:bg-[var(--bg-elev)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    getTaskTone()
                )}
                style={{
                    top: top + TIMED_EVENT_INSET_Y,
                    height: renderedHeight,
                    left: `calc(${left} + ${TIMED_EVENT_INSET_X}px)`,
                    width: `calc(${width} - ${TIMED_EVENT_INSET_X * 2}px)`,
                }}
            >
                <div className="flex min-w-0 items-start justify-between gap-1.5">
                    <div className="min-w-0">
                        <div className={cn("truncate font-semibold", roomy ? "text-[11px] leading-4" : "text-[10px] leading-3")}>{task?.title || "Untitled task"}</div>
                        {roomy && (
                            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px] leading-3 text-muted-foreground">
                                <Clock3 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{formatTimeRange(start, end)}</span>
                            </div>
                        )}
                    </div>
                    {laneCount > 1 && (
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-[9px] font-semibold text-muted-foreground">
                            {laneCount}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label={`Unschedule ${task?.title || "task"}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        unscheduleTask(schedule.taskId);
                    }}
                    className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-[var(--r-1)] text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground group-hover/event:opacity-100 group-focus-visible/event:opacity-100"
                >
                    <Link2Off className="h-3 w-3" />
                </button>
            </div>
        );
    };

    const renderTimedGrid = () => (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-3)] border border-border bg-card/55">
            <div
                className="grid border-b border-border bg-[var(--bg-elev)]/55"
                style={{
                    gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                    paddingRight: timeGridGutter,
                }}
            >
                <div className="border-r border-border" />
                {visibleDays.map((day) => (
                    <div
                        key={day.toISOString()}
                        className={cn(
                            "border-r border-border px-3 py-2 last:border-r-0",
                            isToday(day) && "bg-primary/[0.06]"
                        )}
                    >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {format(day, "EEE")}
                        </div>
                        <div className={cn("mt-0.5 text-lg font-semibold", isToday(day) && "text-primary")}>
                            {format(day, "d")}
                        </div>
                    </div>
                ))}
            </div>
            <div
                ref={timeGridScrollRef}
                className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                style={{ scrollbarGutter: "stable" }}
            >
                {todayIndex >= 0 && (
                    <div
                        className="pointer-events-none absolute left-0 right-0 z-20 grid h-0"
                        style={{
                            top: currentTimeTop,
                            gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                        }}
                    >
                        <div
                            className="relative h-px bg-[var(--rose)]"
                            style={{ gridColumn: todayIndex + 2 }}
                        >
                            <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--rose)]" />
                        </div>
                    </div>
                )}
                {HOURS.map((hour) => (
                    <div
                        key={hour}
                        className="grid min-h-0 overflow-hidden border-b border-border/75 last:border-b-0"
                        style={{ height: TIME_ROW_HEIGHT, gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                    >
                        <div className="border-r border-border px-2 py-2 text-right text-[10px] text-muted-foreground">
                            {format(normalizeSlot(new Date(), hour), "ha")}
                        </div>
                        {visibleDays.map((day) => {
                            const items = scheduledItems.filter(({ schedule }) => {
                                const start = parseISO(schedule.startAt);
                                return isSameDay(start, day) && start.getHours() === hour;
                            });
                            const targetKey = `${day.toISOString()}-${hour}`;
                            return (
                                <div
                                    key={targetKey}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`${format(day, "MMMM d")} at ${format(normalizeSlot(day, hour), "h a")}, ${items.length} scheduled ${items.length === 1 ? "task" : "tasks"}`}
                                    onClick={() => {
                                        if (items.length > 0) openSlotDetails(day, hour);
                                        else openCreateTaskAtSlot(day, hour);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            if (items.length > 0) openSlotDetails(day, hour);
                                            else openCreateTaskAtSlot(day, hour);
                                        }
                                    }}
                                    onDragEnter={() => setDragTarget(targetKey)}
                                    onDragLeave={() => setDragTarget((current) => current === targetKey ? null : current)}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                        setDragTarget(targetKey);
                                    }}
                                    onDrop={(event) => handleDrop(event, day, hour)}
                                    className={cn(
                                        "group/cell relative min-h-0 cursor-pointer overflow-hidden border-r border-border/75 p-1.5 transition-colors last:border-r-0 hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                                        dragTarget === targetKey && "bg-primary/[0.08] ring-1 ring-inset ring-primary/35"
                                    )}
                                    style={{ height: TIME_ROW_HEIGHT }}
                                >
                                    {items.length === 0 ? (
                                        <div className="pointer-events-none flex h-full items-start justify-end opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100">
                                            <span className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                                                <Plus className="h-3 w-3" />
                                                Task
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="pointer-events-none absolute bottom-1 right-1 rounded-[var(--r-1)] bg-background/70 px-1 text-[9px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100">
                                            {items.length} item{items.length === 1 ? "" : "s"}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div
                    className="pointer-events-none absolute left-0 right-0 top-0 z-10 grid"
                    style={{
                        height: HOURS.length * TIME_ROW_HEIGHT,
                        gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                    }}
                >
                    <div />
                    {visibleDays.map((day) => {
                        const dayItems = scheduledItems.filter(({ schedule }) => isSameDay(parseISO(schedule.startAt), day));
                        return (
                            <div key={`events-${day.toISOString()}`} className="pointer-events-none relative min-w-0 px-1.5">
                                {layoutTimedItems(dayItems).map((item) => renderTimedEvent(item))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    const renderMonthGrid = () => (
        <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[var(--r-3)] border border-border bg-card/55">
            <div className="grid grid-cols-7 border-b border-border bg-[var(--bg-elev)]/55">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="border-r border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground last:border-r-0">
                        {day}
                    </div>
                ))}
            </div>
            <div
                className="grid h-full min-h-0 grid-cols-7 overflow-hidden"
                style={{ gridTemplateRows: `repeat(${monthRows}, minmax(0, 1fr))` }}
            >
                {visibleDays.map((day) => {
                    const items = scheduledItems.filter(({ schedule }) => isSameDay(parseISO(schedule.startAt), day));
                    const visibleItems = items.slice(0, 3);
                    const targetKey = `month-${day.toISOString()}`;
                    return (
                        <div
                            key={day.toISOString()}
                            role="button"
                            tabIndex={0}
                            aria-label={
                                items.length > 0
                                    ? `${format(day, "MMMM d")}, ${items.length} scheduled tasks`
                                    : `${format(day, "MMMM d")}, create scheduled task`
                            }
                            onClick={() => {
                                if (items.length > 0) openDayDetails(day);
                                else openCreateTaskAtDate(day);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    if (items.length > 0) openDayDetails(day);
                                    else openCreateTaskAtDate(day);
                                }
                            }}
                            onDragEnter={() => setDragTarget(targetKey)}
                            onDragLeave={() => setDragTarget((current) => current === targetKey ? null : current)}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDragTarget(targetKey);
                            }}
                            onDrop={(event) => handleDrop(event, day)}
                            className={cn(
                                "group/cell min-h-0 cursor-pointer overflow-hidden border-b border-r border-border/75 p-1.5 transition-colors hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                                dragTarget === targetKey && "bg-primary/[0.08] ring-1 ring-inset ring-primary/35",
                                !isSameMonth(day, anchorDate) && "bg-background/35 text-muted-foreground",
                                isToday(day) && "bg-primary/[0.055]"
                            )}
                        >
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <div className={cn("flex size-5 items-center justify-center rounded-full text-xs font-semibold", isToday(day) && "bg-primary text-primary-foreground")}>
                                    {format(day, "d")}
                                </div>
                                {items.length === 0 && (
                                    <span className="pointer-events-none inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100">
                                        <Plus className="h-3 w-3" />
                                        Task
                                    </span>
                                )}
                            </div>
                            <div className="min-h-0 space-y-1 overflow-hidden">
                                {visibleItems.map(({ schedule, task }) => renderMonthEvent(schedule, task))}
                                {items.length > visibleItems.length && (
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openDayDetails(day);
                                        }}
                                        className="block h-4 rounded-[var(--r-1)] px-1 text-left text-[10px] font-medium leading-4 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                    >
                                        +{items.length - visibleItems.length} more
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
        <div className="flex min-h-0 flex-1 gap-4">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <div className="flex shrink-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>
                            Today
                        </Button>
                        <div className="flex items-center rounded-[var(--r-2)] border border-border bg-secondary">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setAnchorDate((date) => moveAnchor(view, date, -1))}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setAnchorDate((date) => moveAnchor(view, date, 1))}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <h2 className="truncate text-base font-semibold tracking-normal text-foreground">
                            {getRangeLabel(view, anchorDate)}
                        </h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <div className="flex rounded-[var(--r-2)] border border-border bg-secondary p-0.5">
                            {VIEW_LABELS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setView(option.value)}
                                    className={cn(
                                        "h-7 rounded-[var(--r-1)] px-3 text-xs font-medium text-muted-foreground transition-colors",
                                        view === option.value && "bg-primary text-primary-foreground shadow-sm"
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--r-3)] border border-border bg-card/55">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                ) : view === "month" ? (
                    renderMonthGrid()
                ) : (
                    renderTimedGrid()
                )}
            </section>

            <aside className="flex w-[286px] shrink-0 flex-col gap-3">
                <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                        <div>
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Unscheduled
                            </div>
                            <div className="text-sm font-semibold text-foreground">{unscheduledTasks.length} tasks</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">Drag to calendar or click to edit.</div>
                        </div>
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="custom-scrollbar max-h-[62vh] space-y-2 overflow-auto pr-1">
                        {unscheduledTasks.length === 0 ? (
                            <div className="rounded-[var(--r-2)] border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                                <div>All open tasks are scheduled.</div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 h-8 gap-1.5"
                                    onClick={openCreateTaskNextHour}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Create scheduled task
                                </Button>
                            </div>
                        ) : (
                            unscheduledTasks.map((task) => (
                                <Task
                                    key={task.id}
                                    task={task as any}
                                    onEdit={handleEditTask}
                                    onDelete={handleDeleteTask}
                                    onToggleStatus={handleToggleTaskStatus}
                                    onUpdate={handleUpdateTask}
                                    isDeleting={isDeletingTask}
                                    deleteVariables={deleteTaskVariables}
                                    surface="list"
                                    nativeDragTaskId={task.id}
                                />
                            ))
                        )}
                    </div>
                </div>

            </aside>
        </div>
        <Dialog open={!!detailDialog} onOpenChange={(open) => !open && setDetailDialog(null)}>
            <DialogContent className="max-w-md border-border bg-[var(--bg-elev)] p-0 shadow-[0_24px_80px_-52px_rgba(0,0,0,0.95)]">
                <DialogHeader className="border-b border-border px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <DialogTitle className="truncate text-base">
                                {detailTitle}
                            </DialogTitle>
                            <DialogDescription>
                                {detailDescription}
                            </DialogDescription>
                        </div>
                        {detailDialog && (
                            <div className="flex shrink-0 items-center gap-1.5">
                                {view !== "day" && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 shrink-0"
                                        onClick={jumpToDetailDay}
                                    >
                                        Day
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 gap-1.5"
                                    onClick={openCreateTaskFromDetails}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Task
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogHeader>
                <div className="custom-scrollbar max-h-[52vh] space-y-2 overflow-auto px-5 py-4">
                    {!detailDialog || detailItems.length === 0 ? (
                        <div className="rounded-[var(--r-2)] border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                            No scheduled tasks for this day.
                        </div>
                    ) : (
                        detailItems.map(({ task }) =>
                            task ? (
                                <Task
                                    key={task.id}
                                    task={task as any}
                                    onEdit={handleEditTask}
                                    onDelete={handleDeleteTask}
                                    onToggleStatus={handleToggleTaskStatus}
                                    onUpdate={handleUpdateTask}
                                    isDeleting={isDeletingTask}
                                    deleteVariables={deleteTaskVariables}
                                    surface="kanban"
                                    hideDragHandle
                                    showCalendarActions
                                />
                            ) : null
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
        <TaskDialog
            mode="create"
            open={!!createSlot}
            onOpenChange={(open) => {
                if (!open) setCreateSlot(null);
            }}
            onCreate={handleCreateTask}
            isSaving={isCreatingTask}
            defaultValues={{ status: "pending", projectId: activeProjectId, schedule: createSlotScheduleDraft }}
        />
        {selectedTask && (
            <TaskDialog
                mode="view"
                open={!!selectedTaskId}
                onOpenChange={(open) => {
                    if (!open) setSelectedTaskId(null);
                }}
                task={selectedTask as any}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onToggleStatus={handleToggleTaskStatus}
                isDeleting={isDeletingTask}
                deleteVariables={deleteTaskVariables}
            />
        )}
        </>
    );
}
