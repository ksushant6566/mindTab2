import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { tasksQueryOptions, useUpdateTask } from "~/api/hooks";

export type CalendarSchedule = {
    taskId: string;
    startAt: string;
    endAt: string;
    createdAt: string;
    updatedAt: string;
};

export type CalendarScheduleMap = Record<string, CalendarSchedule>;

type ScheduledTask = {
    id: string;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
};

const LEGACY_STORAGE_KEY = "mindtab-calendar-schedules";
const STORAGE_KEY = "mindtab-calendar-schedule-store";
const localMigrationTaskIds = new Set<string>();

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
}

function parseStoredSchedules(raw: string | null): CalendarScheduleMap {
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (parsed?.state?.schedules && typeof parsed.state.schedules === "object") {
            return parsed.state.schedules;
        }
        if (parsed?.schedules && typeof parsed.schedules === "object") {
            return parsed.schedules;
        }
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function readLocalSchedules(): CalendarScheduleMap {
    if (typeof window === "undefined") return {};

    return {
        ...parseStoredSchedules(window.localStorage.getItem(LEGACY_STORAGE_KEY)),
        ...parseStoredSchedules(window.localStorage.getItem(STORAGE_KEY)),
    };
}

function removeLocalSchedule(taskId: string) {
    if (typeof window === "undefined") return;

    const remainingSchedules = readLocalSchedules();
    delete remainingSchedules[taskId];
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (Object.keys(remainingSchedules).length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: { schedules: remainingSchedules },
        version: 0,
    }));
}

function isValidSchedule(schedule: CalendarSchedule | undefined): schedule is CalendarSchedule {
    if (!schedule) return false;
    const start = new Date(schedule.startAt).getTime();
    const end = new Date(schedule.endAt).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function formatScheduleRange(schedule: CalendarSchedule) {
    const start = new Date(schedule.startAt);
    const end = new Date(schedule.endAt);
    const date = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(start);
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });

    return `${date}, ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

export function useCalendarSchedules() {
    const { data } = useQuery(tasksQueryOptions({ includeArchived: true }));
    const { mutate: updateTask, mutateAsync: updateTaskAsync } = useUpdateTask();
    const tasks = (data ?? []) as ScheduledTask[];

    const schedules = useMemo(
        () => tasks.reduce<CalendarScheduleMap>((result, task) => {
            if (!task.scheduledStartAt || !task.scheduledEndAt) return result;

            result[task.id] = {
                taskId: task.id,
                startAt: task.scheduledStartAt,
                endAt: task.scheduledEndAt,
                createdAt: task.createdAt ?? task.scheduledStartAt,
                updatedAt: task.updatedAt ?? task.scheduledStartAt,
            };
            return result;
        }, {}),
        [tasks]
    );

    useEffect(() => {
        if (typeof window === "undefined" || !data) return;

        const localSchedules = readLocalSchedules();
        tasks
            .filter((task) => localSchedules[task.id] && (
                (task.scheduledStartAt && task.scheduledEndAt)
                || !isValidSchedule(localSchedules[task.id])
            ))
            .forEach((task) => removeLocalSchedule(task.id));

        const schedulesToMigrate = tasks
            .filter((task) => !task.scheduledStartAt && !task.scheduledEndAt)
            .map((task) => localSchedules[task.id])
            .filter(isValidSchedule)
            .filter((schedule) => !localMigrationTaskIds.has(schedule.taskId));

        schedulesToMigrate.forEach((schedule) => localMigrationTaskIds.add(schedule.taskId));

        void (async () => {
            for (const schedule of schedulesToMigrate) {
                try {
                    await updateTaskAsync({
                        id: schedule.taskId,
                        scheduledStartAt: schedule.startAt,
                        scheduledEndAt: schedule.endAt,
                    });
                    removeLocalSchedule(schedule.taskId);
                } catch {
                    localMigrationTaskIds.delete(schedule.taskId);
                }
            }
        })();
    }, [data, tasks, updateTaskAsync]);

    const setSchedule = useCallback((taskId: string, startAt: Date, endAt: Date) => {
        updateTask({
            id: taskId,
            scheduledStartAt: startAt.toISOString(),
            scheduledEndAt: endAt.toISOString(),
        });
    }, [updateTask]);

    const scheduleTask = useCallback((taskId: string, startAt: Date, durationMinutes = 60) => {
        setSchedule(taskId, startAt, addMinutes(startAt, durationMinutes));
    }, [setSchedule]);

    const unscheduleTask = useCallback((taskId: string) => {
        updateTask({ id: taskId, scheduledStartAt: null, scheduledEndAt: null });
    }, [updateTask]);

    return { schedules, setSchedule, scheduleTask, unscheduleTask };
}
