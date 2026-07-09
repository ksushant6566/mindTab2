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
    Clock3,
    Link2Off,
    Plus,
} from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    tasksQueryOptions,
    projectsQueryOptions,
    useCreateTask,
    useDeleteTask,
    useUpdateTask,
} from "~/api/hooks";
import { TaskDialog, type TaskDialogInput, type TaskDialogMode } from "~/components/tasks/task-dialog";
import { createEnabledScheduleDraft, getScheduleDraftPayload } from "~/components/tasks/task-schedule-fields";
import { Task } from "~/components/tasks/task";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import {
    CalendarDetailDialog,
    CalendarEventChip,
    CalendarGridCell,
    CalendarMonthGrid,
    CalendarTimeGrid,
    CalendarTimedEvent,
    CalendarToolbar,
} from "./primitives";
import { SchedulingTray, type PlanningStatusFilter, type SchedulingTrayProject } from "./scheduling-tray";
import { type CalendarSchedule, useCalendarSchedules } from "~/lib/calendar-schedules";
import { cn } from "~/lib/utils";
import { getStatusTone } from "~/lib/tones";
import { CalendarDayTimeline } from "./day-timeline";

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
    projectName?: string | null;
    key?: string | null;
    code?: string | null;
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
function getTaskStatusStyle(task?: TaskRecord): React.CSSProperties {
    const tone = getStatusTone(task?.status);
    return {
        "--task-status-color": tone.tone,
        "--task-status-bg": tone.background,
        "--task-status-fg": tone.tone,
    } as React.CSSProperties;
}

function getTaskTone(task?: TaskRecord) {
    return cn(
        "border-[var(--task-status-color)] bg-[var(--task-status-bg)] text-foreground shadow-[inset_3px_0_0_var(--task-status-color)]",
        task?.status === "completed" && "text-muted-foreground"
    );
}

function getTaskProjectId(task: TaskRecord) {
    return task.projectId ?? task.project?.id ?? null;
}

function getPriorityRank(priority?: string | null) {
    if (priority === "priority_1") return 0;
    if (priority === "priority_2") return 1;
    if (priority === "priority_3") return 2;
    return 3;
}

function getImpactRank(impact?: string | null) {
    if (impact === "high") return 0;
    if (impact === "medium") return 1;
    return 2;
}

function getStatusRank(status?: string | null) {
    if (status === "in_progress") return 0;
    return 1;
}

function getTaskRecency(task: TaskRecord) {
    const value = task.updatedAt || task.createdAt || "";
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function sortPlanningTasks(left: TaskRecord, right: TaskRecord) {
    return (
        getStatusRank(left.status) - getStatusRank(right.status) ||
        getPriorityRank(left.priority) - getPriorityRank(right.priority) ||
        getImpactRank(left.impact) - getImpactRank(right.impact) ||
        getTaskRecency(right) - getTaskRecency(left)
    );
}

function isStatusOnlyUpdate(values: Record<string, unknown>) {
    const keys = Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
    return keys.length === 1 && keys[0] === "status";
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

type CalendarProps = {
    isActive?: boolean;
};

export function Calendar({ isActive = true }: CalendarProps) {
    const [view, setView] = useState<CalendarView>(() => getStoredCalendarView());
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [detailDialog, setDetailDialog] = useState<DetailDialogState>(null);
    const [createSlot, setCreateSlot] = useState<CreateSlotState>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskMode, setSelectedTaskMode] = useState<TaskDialogMode>("view");
    const [selectedTaskSnapshot, setSelectedTaskSnapshot] = useState<TaskRecord | null>(null);
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [planningProjectFilter, setPlanningProjectFilter] = useState("all");
    const [planningStatusFilter, setPlanningStatusFilter] = useState<PlanningStatusFilter>("all");
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [timeGridGutter, setTimeGridGutter] = useState(0);
    const timeGridScrollRef = useRef<HTMLDivElement | null>(null);
    const { schedules, setSchedule, scheduleTask, unscheduleTask } = useCalendarSchedules();
    const { data: tasksData, isLoading } = useQuery(
        tasksQueryOptions({ includeArchived: true })
    );
    const { data: projectsData } = useQuery(projectsQueryOptions());
    const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
    const { mutate: updateTask } = useUpdateTask();
    const {
        mutate: deleteTask,
        isPending: isDeletingTask,
        variables: deleteTaskVariables,
    } = useDeleteTask();

    const tasks = useMemo(() => ((tasksData as TaskRecord[]) ?? []), [tasksData]);
    const projects = useMemo(() => ((projectsData as SchedulingTrayProject[]) ?? []).filter((project) => project.id), [projectsData]);
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

    const projectFilteredPlanningTasks = useMemo(
        () =>
            tasks
                .filter((task) => {
                if (!["pending", "in_progress"].includes(task.status ?? "")) return false;
                if (schedules[task.id]) return false;
                if (planningProjectFilter === "all") return true;
                if (planningProjectFilter === "unassigned") return !getTaskProjectId(task);
                return getTaskProjectId(task) === planningProjectFilter;
            })
                .sort(sortPlanningTasks),
        [planningProjectFilter, schedules, tasks]
    );
    const planningTasks = useMemo(
        () =>
            projectFilteredPlanningTasks.filter((task) =>
                planningStatusFilter === "all" ? true : task.status === planningStatusFilter
            ),
        [planningStatusFilter, projectFilteredPlanningTasks]
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
    const selectedTaskFromQuery = selectedTaskId ? taskById.get(selectedTaskId) : null;
    const selectedTask = selectedTaskId
        ? selectedTaskSnapshot?.id === selectedTaskId
            ? { ...(selectedTaskFromQuery ?? {}), ...selectedTaskSnapshot }
            : selectedTaskFromQuery
        : null;
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
        if (!isActive) return;
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
    }, [isActive, view]);

    useEffect(() => {
        if (!isActive) return;
        if (view === "month" || todayIndex < 0) return;

        const frame = window.requestAnimationFrame(() => {
            const container = timeGridScrollRef.current;
            if (!container) return;

            const targetTop = Math.max(0, currentTimeTop - TIME_ROW_HEIGHT * 2);
            container.scrollTo({ top: targetTop, behavior: "auto" });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [anchorDate, isActive, todayIndex, view]);

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

    const handleEditTask = (taskId: string, mode: "view" | "edit" = "view") => {
        openTaskDialog(taskId, mode);
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
        const taskData = { ...taskFields, status: "pending", projectId: null };
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

    const openTaskDialog = (taskId: string, mode: "view" | "edit" = "view") => {
        setSelectedTaskSnapshot(taskById.get(taskId) ?? null);
        setSelectedTaskMode(mode);
        setSelectedTaskId(taskId);
        setDetailDialog(null);
    };

    const renderMonthEvent = (schedule: CalendarSchedule, task?: TaskRecord) => {
        const start = parseISO(schedule.startAt);
        const end = parseISO(schedule.endAt);
        const statusTone = getStatusTone(task?.status);
        return (
            <CalendarEventChip
                key={schedule.taskId}
                role="button"
                tabIndex={0}
                draggable
                title={task?.title || "Untitled task"}
                time={formatTimeRange(start, end)}
                tone={statusTone.tone}
                completed={task?.status === "completed"}
                aria-label={`${task?.title || "Untitled task"}, ${statusTone.label}, ${formatTimeRange(start, end)}`}
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
                    "group/event h-[18px] w-full cursor-grab rounded-[var(--r-2)] px-1.5 py-0 text-left",
                    "overflow-hidden transition-colors hover:bg-[var(--bg-elev)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    getTaskTone(task)
                )}
                style={getTaskStatusStyle(task)}
            />
        );
    };

    const renderTimedEvent = (item: TimedLayoutItem) => {
        const { schedule, task, lane, laneCount, top, height } = item;
        const start = parseISO(schedule.startAt);
        const end = parseISO(schedule.endAt);
        const statusTone = getStatusTone(task?.status);
        const laneGap = 4;
        const width = `calc((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount})`;
        const left = `calc(${lane} * ((100% - ${(laneCount - 1) * laneGap}px) / ${laneCount} + ${laneGap}px))`;
        const renderedHeight = Math.max(MIN_TIMED_EVENT_RENDER_HEIGHT, height - TIMED_EVENT_INSET_Y * 2);
        const roomy = height >= 46;

        return (
            <CalendarTimedEvent
                key={schedule.taskId}
                role="button"
                tabIndex={0}
                draggable
                title={task?.title || "Untitled task"}
                tone={statusTone.tone}
                completed={task?.status === "completed"}
                aria-label={`${task?.title || "Untitled task"}, ${statusTone.label}, ${formatTimeRange(start, end)}`}
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
                    getTaskTone(task)
                )}
                style={{
                    ...getTaskStatusStyle(task),
                    top: top + TIMED_EVENT_INSET_Y,
                    height: renderedHeight,
                    left: `calc(${left} + ${TIMED_EVENT_INSET_X}px)`,
                    width: `calc(${width} - ${TIMED_EVENT_INSET_X * 2}px)`,
                }}
            >
                <div className="flex min-w-0 items-start justify-between gap-1.5">
                    <div className="min-w-0">
                        <div className={cn("truncate", roomy ? "text-[length:var(--type-meta-size)] leading-4" : "text-[length:var(--type-meta-size)] leading-3", task?.status === "completed" && "line-through decoration-[var(--task-status-color)]/70")}>{task?.title || "Untitled task"}</div>
                        {roomy && (
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[length:var(--type-meta-size)] leading-3 text-muted-foreground">
                                <span className="inline-flex shrink-0 items-center gap-1" style={{ color: "var(--task-status-fg)" }}>
                                    <span className="size-1.5 rounded-full bg-[var(--task-status-color)]" />
                                    {statusTone.label}
                                </span>
                                <Clock3 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{formatTimeRange(start, end)}</span>
                            </div>
                        )}
                    </div>
                    {laneCount > 1 && (
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-[length:var(--type-meta-size)] text-muted-foreground">
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
            </CalendarTimedEvent>
        );
    };

    const renderTimedGrid = () => (
        <CalendarTimeGrid className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-3)] border border-border bg-card/55">
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
                        <MetaText as="div" className="uppercase">
                            {format(day, "EEE")}
                        </MetaText>
                        <Heading as="div" variant="panel" className={cn("mt-0.5 text-[length:var(--type-title-size)]", isToday(day) && "text-primary")}>
                            {format(day, "d")}
                        </Heading>
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
                            className="relative h-px bg-[var(--tone-calendar-now)]"
                            style={{ gridColumn: todayIndex + 2 }}
                        >
                            <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--tone-calendar-now)]" />
                        </div>
                    </div>
                )}
                {HOURS.map((hour) => (
                    <div
                        key={hour}
                        className="grid min-h-0 overflow-hidden border-b border-border/75 last:border-b-0"
                        style={{ height: TIME_ROW_HEIGHT, gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                    >
                        <MetaText as="div" className="border-r border-border px-2 py-2 text-right">
                            {format(normalizeSlot(new Date(), hour), "ha")}
                        </MetaText>
                        {visibleDays.map((day) => {
                            const items = scheduledItems.filter(({ schedule }) => {
                                const start = parseISO(schedule.startAt);
                                return isSameDay(start, day) && start.getHours() === hour;
                            });
                            const targetKey = `${day.toISOString()}-${hour}`;
                            return (
                                <CalendarGridCell
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
                                        <div className={cn("pointer-events-none flex h-full items-start justify-end opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100", dragTarget === targetKey && "opacity-100")}>
                                            <MetaText className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 shadow-sm">
                                                <Plus className="h-3 w-3" />
                                                {dragTarget === targetKey ? `Drop at ${format(normalizeSlot(day, hour), "h a")}` : "Task"}
                                            </MetaText>
                                        </div>
                                    ) : (
                                        <MetaText as="div" className="pointer-events-none absolute bottom-1 right-1 rounded-[var(--r-1)] bg-background/70 px-1 opacity-0 transition-opacity group-hover/cell:opacity-100">
                                            {items.length} item{items.length === 1 ? "" : "s"}
                                        </MetaText>
                                    )}
                                </CalendarGridCell>
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
        </CalendarTimeGrid>
    );

    const renderDayTimedGrid = () => {
        const day = visibleDays[0] ?? startOfDay(anchorDate);
        const dayItems = scheduledItems.filter(({ schedule }) => isSameDay(parseISO(schedule.startAt), day));

        return (
            <CalendarTimeGrid className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-3)] border border-border bg-card/55">
                <div
                    className="grid border-b border-border bg-[var(--bg-elev)]/55"
                    style={{
                        gridTemplateColumns: "56px minmax(0, 1fr)",
                        paddingRight: timeGridGutter,
                    }}
                >
                    <div className="border-r border-border" />
                    <div
                        className={cn(
                            "px-3 py-2",
                            isToday(day) && "bg-primary/[0.06]"
                        )}
                    >
                        <MetaText as="div" className="uppercase">
                            {format(day, "EEE")}
                        </MetaText>
                        <Heading as="div" variant="panel" className={cn("mt-0.5 text-[length:var(--type-title-size)]", isToday(day) && "text-primary")}>
                            {format(day, "d")}
                        </Heading>
                    </div>
                </div>
                <CalendarDayTimeline
                    scrollRef={timeGridScrollRef}
                    day={day}
                    items={dayItems}
                    now={currentTime}
                    showCurrentTime={isToday(day)}
                    hourHeight={TIME_ROW_HEIGHT}
                    gutterWidth={56}
                    minEventHeight={MIN_TIMED_EVENT_HEIGHT}
                    className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                    style={{ scrollbarGutter: "stable" }}
                    eventOverlayClassName="px-1.5"
                    getSlotAriaLabel={({ slotDate, items: slotItems }) =>
                        `${format(day, "MMMM d")} at ${format(slotDate, "h a")}, ${slotItems.length} scheduled ${slotItems.length === 1 ? "task" : "tasks"}`
                    }
                    onSlotClick={({ hour, items: slotItems }) => {
                        if (slotItems.length > 0) openSlotDetails(day, hour);
                        else openCreateTaskAtSlot(day, hour);
                    }}
                    onSlotDragEnter={({ targetKey }) => setDragTarget(targetKey)}
                    onSlotDragLeave={({ targetKey }) => setDragTarget((current) => current === targetKey ? null : current)}
                    onSlotDragOver={(event, { targetKey }) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragTarget(targetKey);
                    }}
                    onSlotDrop={(event, { hour }) => handleDrop(event, day, hour)}
                    slotClassName={({ targetKey }) =>
                        cn(
                            "group/cell p-1.5",
                            dragTarget === targetKey && "bg-primary/[0.08] ring-1 ring-inset ring-primary/35"
                        )
                    }
                    renderSlotContent={({ hour, targetKey, items: slotItems }) =>
                        slotItems.length === 0 ? (
                            <div className={cn("pointer-events-none flex h-full items-start justify-end opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100", dragTarget === targetKey && "opacity-100")}>
                                <MetaText className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 shadow-sm">
                                    <Plus className="h-3 w-3" />
                                    {dragTarget === targetKey ? `Drop at ${format(normalizeSlot(day, hour), "h a")}` : "Task"}
                                </MetaText>
                            </div>
                        ) : (
                            <MetaText as="div" className="pointer-events-none absolute bottom-1 right-1 rounded-[var(--r-1)] bg-background/70 px-1 opacity-0 transition-opacity group-hover/cell:opacity-100">
                                {slotItems.length} item{slotItems.length === 1 ? "" : "s"}
                            </MetaText>
                        )
                    }
                    renderEvent={renderTimedEvent}
                />
            </CalendarTimeGrid>
        );
    };

    const renderMonthGrid = () => (
        <CalendarMonthGrid className="h-full flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] bg-card/55">
            <div className="grid grid-cols-7 border-b border-border bg-[var(--bg-elev)]/55">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <MetaText as="div" key={day} className="border-r border-border px-3 py-2 uppercase last:border-r-0">
                        {day}
                    </MetaText>
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
                        <CalendarGridCell
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
                                <Heading as="div" variant="panel" className={cn("flex size-5 items-center justify-center rounded-full", isToday(day) && "bg-primary text-primary-foreground")}>
                                    {format(day, "d")}
                                </Heading>
                                {items.length === 0 && (
                                    <MetaText className={cn("pointer-events-none inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background/80 px-1.5 py-0.5 opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 group-focus/cell:opacity-100", dragTarget === targetKey && "opacity-100")}>
                                        <Plus className="h-3 w-3" />
                                        {dragTarget === targetKey ? `Drop on ${format(day, "MMM d")}` : "Task"}
                                    </MetaText>
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
                                        className="block h-4 rounded-[var(--r-1)] px-1 text-left text-[length:var(--type-meta-size)] leading-4 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                    >
                                        +{items.length - visibleItems.length} more
                                    </button>
                                )}
                            </div>
                        </CalendarGridCell>
                    );
                })}
            </div>
        </CalendarMonthGrid>
    );

    return (
        <>
        <div className="flex min-h-0 flex-1 gap-4">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <CalendarToolbar
                    title={getRangeLabel(view, anchorDate)}
                    onPrevious={() => setAnchorDate((date) => moveAnchor(view, date, -1))}
                    onNext={() => setAnchorDate((date) => moveAnchor(view, date, 1))}
                    actions={
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>
                            Today
                        </Button>
                        <SegmentedControl
                            aria-label="Calendar view"
                            value={view}
                            options={VIEW_LABELS}
                            onValueChange={setView}
                        />
                    </div>
                    }
                />

                {isLoading ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--r-3)] border border-border bg-card/55">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                ) : view === "month" ? (
                    renderMonthGrid()
                ) : view === "day" ? (
                    renderDayTimedGrid()
                ) : (
                    renderTimedGrid()
                )}
            </section>

            <SchedulingTray
                tasks={planningTasks}
                statusCountTasks={projectFilteredPlanningTasks}
                projects={projects}
                projectFilter={planningProjectFilter}
                statusFilter={planningStatusFilter}
                onProjectFilterChange={setPlanningProjectFilter}
                onStatusFilterChange={setPlanningStatusFilter}
                onEditTask={handleEditTask}
            />
        </div>
        <CalendarDetailDialog
            open={!!detailDialog}
            onOpenChange={(open: boolean) => !open && setDetailDialog(null)}
            title={detailTitle}
            description={detailDescription}
            actions={detailDialog ? (
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
            ) : null}
        >
            {!detailDialog || detailItems.length === 0 ? (
                <div className="rounded-[var(--r-2)] border border-dashed border-border px-3 py-6 text-center">
                    <Text variant="muted">No scheduled tasks for this day.</Text>
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
        </CalendarDetailDialog>
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
        {selectedTask && (
            <TaskDialog
                mode={selectedTaskMode}
                open={!!selectedTaskId}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedTaskId(null);
                        setSelectedTaskMode("view");
                        setSelectedTaskSnapshot(null);
                    }
                }}
                task={selectedTask as any}
                onUpdate={(taskId, values) => {
                    handleUpdateTask(taskId, values);
                    if (isStatusOnlyUpdate(values)) {
                        setSelectedTaskSnapshot((current) => current?.id === taskId ? { ...current, ...values } as TaskRecord : current);
                    }
                }}
                onDelete={handleDeleteTask}
                onToggleStatus={handleToggleTaskStatus}
                isDeleting={isDeletingTask}
                deleteVariables={deleteTaskVariables}
            />
        )}
        </>
    );
}
