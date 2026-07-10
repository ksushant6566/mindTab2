import { CalendarDays, Check, Clock3 } from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { CalendarSchedule } from "~/lib/calendar-schedules";
import { cn } from "~/lib/utils";

export type TaskScheduleDraft = {
    enabled: boolean;
    startAt: string;
    endAt: string;
};

const DEFAULT_DURATION_MINUTES = 60;
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
    const minutesFromMidnight = index * 30;
    const hour24 = Math.floor(minutesFromMidnight / 60);
    const minute = minutesFromMidnight % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;

    return {
        value: `${pad(hour24)}:${pad(minute)}`,
        label: `${hour12}:${pad(minute)} ${period}`,
        minutesFromMidnight,
    };
});

function pad(value: number) {
    return String(value).padStart(2, "0");
}

export function toDateTimeLocalValue(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateValue(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date: Date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineDateAndTime(dateValue: string, timeValue: string) {
    return `${dateValue}T${timeValue || "00:00"}`;
}

function formatDateLabel(date: Date) {
    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    }).format(date);
}

function formatTimeLabel(date: Date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatDurationLabel(minutes: number) {
    if (minutes < 60) return `${minutes} mins`;
    if (minutes === 60) return "1 hr";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const hourLabel = `${hours} ${hours === 1 ? "hr" : "hrs"}`;
    return remainingMinutes > 0 ? `${hourLabel} ${remainingMinutes} mins` : hourLabel;
}

function getTimeMinutes(timeValue: string) {
    const [hour = "0", minute = "0"] = timeValue.split(":");
    return Number(hour) * 60 + Number(minute);
}

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
}

function getDefaultStart() {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
}

export function createScheduleDraft(schedule?: CalendarSchedule | null, fallbackStart = getDefaultStart(), durationMinutes = DEFAULT_DURATION_MINUTES): TaskScheduleDraft {
    if (schedule) {
        return {
            enabled: true,
            startAt: toDateTimeLocalValue(new Date(schedule.startAt)),
            endAt: toDateTimeLocalValue(new Date(schedule.endAt)),
        };
    }

    return {
        enabled: false,
        startAt: toDateTimeLocalValue(fallbackStart),
        endAt: toDateTimeLocalValue(addMinutes(fallbackStart, durationMinutes)),
    };
}

export function createEnabledScheduleDraft(startAt: Date, endAt: Date): TaskScheduleDraft {
    return {
        enabled: true,
        startAt: toDateTimeLocalValue(startAt),
        endAt: toDateTimeLocalValue(endAt),
    };
}

export function getScheduleDraftPayload(draft?: TaskScheduleDraft | null) {
    if (!draft?.enabled) return null;

    const start = new Date(draft.startAt);
    const end = new Date(draft.endAt);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || durationMinutes <= 0) {
        return null;
    }

    return { startAt: start, endAt: end, durationMinutes };
}

export function isScheduleDraftValid(draft?: TaskScheduleDraft | null) {
    if (!draft?.enabled) return true;
    return !!getScheduleDraftPayload(draft);
}

function TimeDropdownField({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string; detail?: string }>;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const selectedRef = React.useRef<HTMLButtonElement | null>(null);
    const selectedLabel = options.find((option) => option.value === value)?.label ?? formatTimeLabel(new Date(`2000-01-01T${value || "09:00"}`));

    React.useEffect(() => {
        if (!open) return;
        window.requestAnimationFrame(() => {
            const list = listRef.current;
            const selected = selectedRef.current;
            if (!list || !selected) return;

            list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
        });
    }, [open, value]);

    return (
        <div className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-between px-3 text-sm font-normal"
                    >
                        <span>{selectedLabel}</span>
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-[260px] p-1.5">
                    <div
                        ref={listRef}
                        className="custom-scrollbar h-[320px] overflow-y-auto overscroll-contain rounded-[var(--r-2)] pr-2"
                        onWheel={(event) => event.stopPropagation()}
                    >
                        <div className="space-y-1 p-1">
                            {options.length === 0 && (
                                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    No later times available.
                                </div>
                            )}
                            {options.map((option) => {
                                const active = value === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        ref={active ? selectedRef : undefined}
                                        type="button"
                                        onClick={() => {
                                            onChange(option.value);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            "flex h-9 w-full items-center justify-between gap-3 rounded-[var(--r-2)] px-3 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            active && "bg-secondary"
                                        )}
                                    >
                                        <span>{option.label}</span>
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                            {option.detail}
                                            {active && <Check className="h-3 w-3" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function TaskScheduleFields({
    value,
    onChange,
    className,
}: {
    value: TaskScheduleDraft;
    onChange: (value: TaskScheduleDraft) => void;
    className?: string;
}) {
    const invalid = !isScheduleDraftValid(value);
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);
    const startDateValue = Number.isNaN(start.getTime()) ? "" : toDateValue(start);
    const startTimeValue = Number.isNaN(start.getTime()) ? "" : toTimeValue(start);
    const endTimeValue = Number.isNaN(end.getTime()) ? "" : toTimeValue(end);
    const dateLabel = Number.isNaN(start.getTime()) ? "Pick date" : formatDateLabel(start);
    const startMinutes = getTimeMinutes(startTimeValue || "00:00");
    const endOptions = TIME_OPTIONS
        .filter((option) => option.minutesFromMidnight > startMinutes)
        .map((option) => ({
            ...option,
            detail: `(${formatDurationLabel(option.minutesFromMidnight - startMinutes)})`,
        }));

    const updateStart = (startAt: string) => {
        const previousStart = new Date(value.startAt);
        const previousEnd = new Date(value.endAt);
        const nextStart = new Date(startAt);
        const previousDuration = Math.max(DEFAULT_DURATION_MINUTES, Math.round((previousEnd.getTime() - previousStart.getTime()) / 60_000));
        const nextEnd = Number.isNaN(nextStart.getTime()) ? value.endAt : toDateTimeLocalValue(addMinutes(nextStart, previousDuration));
        onChange({ ...value, startAt, endAt: nextEnd });
    };

    const updateDate = (dateValue: string) => {
        if (!dateValue) return;
        updateStart(combineDateAndTime(dateValue, startTimeValue || "09:00"));
    };

    const updateStartTime = (timeValue: string) => {
        if (!timeValue || !startDateValue) return;
        updateStart(combineDateAndTime(startDateValue, timeValue));
    };

    const updateEndTime = (timeValue: string) => {
        const startDate = new Date(value.startAt);
        if (Number.isNaN(startDate.getTime())) return;

        const durationMinutes = getTimeMinutes(timeValue) - getTimeMinutes(startTimeValue || "00:00");
        if (durationMinutes <= 0) return;
        onChange({ ...value, endAt: toDateTimeLocalValue(addMinutes(startDate, durationMinutes)) });
    };

    return (
        <section className={cn("rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-2.5", className)}>
            <div className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                    <Checkbox
                        checked={value.enabled}
                        onCheckedChange={(checked) => onChange({ ...value, enabled: checked === true })}
                        className="size-4 rounded-[var(--r-1)]"
                    />
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span>Schedule on calendar</span>
                </label>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {value.enabled ? "Linked" : "Unscheduled"}
                </span>
            </div>

            {value.enabled && (
                <div className="mt-3 space-y-2">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1.45fr)_112px_auto_112px]">
                        <div className="space-y-1">
                            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Date</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 w-full justify-between px-3 text-sm font-normal"
                                    >
                                        <span className="truncate">{dateLabel}</span>
                                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-auto p-0">
                                    <Calendar
                                        selected={Number.isNaN(start.getTime()) ? null : start}
                                        onSelect={(date) => updateDate(toDateValue(date))}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <TimeDropdownField
                            label="Start"
                            value={startTimeValue}
                            options={TIME_OPTIONS}
                            onChange={updateStartTime}
                        />
                        <div className="hidden items-end justify-center pb-2 text-sm text-muted-foreground lg:flex">-</div>
                        <TimeDropdownField
                            label="End"
                            value={endTimeValue}
                            options={endOptions}
                            onChange={updateEndTime}
                        />
                    </div>
                    {invalid && (
                        <div className="text-xs text-[var(--tone-danger)]">
                            End time must be after start time.
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
