import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, parseISO } from "date-fns";
import { CalendarDays, ExternalLink } from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
import { tasksQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { cn } from "~/lib/utils";

type TaskRecord = {
    id: string;
    title?: string | null;
    status?: string | null;
};

function getStatusDot(status?: string | null) {
    if (status === "completed") return "bg-[var(--green)]";
    if (status === "in_progress") return "bg-[var(--cyan)]";
    return "bg-[var(--amber)]";
}

export function TodayEventsPanel() {
    const { schedules } = useCalendarSchedules();
    const { activeProjectId, setActiveElement } = useAppStore();
    const { data: tasksData, isLoading } = useQuery(
        tasksQueryOptions(activeProjectId ? { projectId: activeProjectId, includeArchived: false } : { includeArchived: false })
    );

    const tasks = useMemo(() => ((tasksData as TaskRecord[]) ?? []).filter((task) => task.status !== "archived"), [tasksData]);
    const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
    const today = useMemo(() => new Date(), []);

    const todayEvents = useMemo(() => {
        return Object.values(schedules)
            .map((schedule) => ({ schedule, task: taskById.get(schedule.taskId) }))
            .filter(({ schedule, task }) => task && isSameDay(parseISO(schedule.startAt), today))
            .sort((left, right) => parseISO(left.schedule.startAt).getTime() - parseISO(right.schedule.startAt).getTime());
    }, [schedules, taskById, today]);

    return (
        <section className="flex min-h-0 flex-col rounded-[var(--r-3)] border border-border bg-card/70 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Today
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{format(today, "EEEE, MMM d")}</p>
                </div>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    title="Open calendar"
                    aria-label="Open calendar"
                    onClick={() => setActiveElement(EActiveLayout.Calendar)}
                >
                    <ExternalLink className="h-4 w-4" />
                </Button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-14 animate-pulse rounded-[var(--r-2)] bg-secondary" />
                        ))}
                    </div>
                ) : todayEvents.length > 0 ? (
                    <div className="space-y-2">
                        {todayEvents.map(({ schedule, task }) => {
                            const start = parseISO(schedule.startAt);
                            const end = parseISO(schedule.endAt);
                            return (
                                <div key={schedule.taskId} className="rounded-[var(--r-2)] border border-border bg-background/70 px-3 py-2">
                                    <div className="flex items-start gap-2">
                                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", getStatusDot(task?.status))} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-foreground">{task?.title || "Untitled task"}</div>
                                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                                                {format(start, "h:mm a")} - {format(end, "h:mm a")}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[var(--r-2)] border border-dashed border-border px-4 text-center">
                        <CalendarDays className="h-8 w-8 text-muted-foreground/70" />
                        <div className="mt-3 text-sm font-medium text-foreground">No events today</div>
                        <div className="mt-1 max-w-[190px] text-xs leading-5 text-muted-foreground">
                            Scheduled tasks for the day will appear here.
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
