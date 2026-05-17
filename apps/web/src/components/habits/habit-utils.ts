export type HabitRecord = {
    id: string;
    title: string;
    description?: string | null;
    frequency?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    [key: string]: unknown;
};

export type HabitTrackerRecord = {
    habitId: string;
    date?: string | null;
    status?: string | null;
    [key: string]: unknown;
};

export const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getTodayKey() {
    return formatDateKey(new Date());
}

export function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

export function startOfWeek(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const mondayIndex = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayIndex);
    return start;
}

export function getWeekDates(baseDate: Date, weekOffset = 0) {
    const start = addDays(startOfWeek(baseDate), weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getWeekLabel(dates: Date[]) {
    const start = dates[0];
    const end = dates[6];
    if (!start || !end) return "";

    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    });

    return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function getCompletedSet(habitTracker: HabitTrackerRecord[]) {
    return new Set(
        habitTracker
            .filter((record) => record.status === "completed" && record.date)
            .map((record) => `${record.habitId}:${record.date}`)
    );
}

export function isHabitCompleted(completedSet: Set<string>, habitId: string, date: string) {
    return completedSet.has(`${habitId}:${date}`);
}

export function getCompletionCount(completedSet: Set<string>, habitId: string, dates: Date[]) {
    return dates.reduce((total, date) => total + (isHabitCompleted(completedSet, habitId, formatDateKey(date)) ? 1 : 0), 0);
}

export function getLastDays(count: number) {
    const today = new Date();
    return Array.from({ length: count }, (_, index) => addDays(today, index - count + 1));
}

export function getCurrentStreak(completedSet: Set<string>, habitId: string) {
    let streak = 0;
    let cursor = new Date();

    for (let index = 0; index < 366; index += 1) {
        const key = formatDateKey(cursor);
        if (!isHabitCompleted(completedSet, habitId, key)) break;
        streak += 1;
        cursor = addDays(cursor, -1);
    }

    return streak;
}

export function isHabitVisibleByDate(habit: HabitRecord, date: Date) {
    if (!habit.createdAt) return true;

    const createdAt = new Date(habit.createdAt);
    createdAt.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(23, 59, 59, 999);

    return createdAt <= target;
}
