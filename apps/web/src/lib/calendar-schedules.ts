import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CalendarSchedule = {
    taskId: string;
    startAt: string;
    endAt: string;
    createdAt: string;
    updatedAt: string;
};

export type CalendarScheduleMap = Record<string, CalendarSchedule>;

type CalendarScheduleState = {
    schedules: CalendarScheduleMap;
    setSchedule: (taskId: string, startAt: Date, endAt: Date) => void;
    scheduleTask: (taskId: string, startAt: Date, durationMinutes?: number) => void;
    unscheduleTask: (taskId: string) => void;
};

const LEGACY_STORAGE_KEY = "mindtab-calendar-schedules";
const STORAGE_KEY = "mindtab-calendar-schedule-store";

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
}

function readLegacySchedules(): CalendarScheduleMap {
    if (typeof window === "undefined") return {};

    try {
        const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return {};
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

export const useCalendarSchedules = create<CalendarScheduleState>()(
    persist(
        (set) => ({
            schedules: readLegacySchedules(),
            setSchedule: (taskId, startAt, endAt) => {
                const now = new Date().toISOString();
                set((state) => {
                    const existing = state.schedules[taskId];

                    return {
                        schedules: {
                            ...state.schedules,
                            [taskId]: {
                                taskId,
                                startAt: startAt.toISOString(),
                                endAt: endAt.toISOString(),
                                createdAt: existing?.createdAt ?? now,
                                updatedAt: now,
                            },
                        },
                    };
                });
            },
            scheduleTask: (taskId, startAt, durationMinutes = 60) => {
                useCalendarSchedules.getState().setSchedule(taskId, startAt, addMinutes(startAt, durationMinutes));
            },
            unscheduleTask: (taskId) => {
                set((state) => {
                    const schedules = { ...state.schedules };
                    delete schedules[taskId];
                    return { schedules };
                });
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state) => ({ schedules: state.schedules }),
        }
    )
);
