import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, parseISO } from "date-fns";
import { CalendarDays, ExternalLink } from "lucide-react";
import { EActiveLayout, useAppStore } from "@mindtab/core";
import { tasksQueryOptions } from "~/api/hooks";
import { CalendarEventChip } from "~/components/domain/calendar/primitives";
import { Panel, PanelBody, PanelHeader } from "~/components/layout";
import { EmptyState, SkeletonBlock } from "~/components/patterns";
import { Button } from "~/components/ui/button";
import { Heading, MetaText } from "~/components/ui/typography";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { getStatusTone } from "~/lib/tones";

type TaskRecord = {
    id: string;
    title?: string | null;
    status?: string | null;
};

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
        <Panel padding="none" className="flex min-h-0 flex-col bg-card/70">
            <PanelHeader className="items-start">
                <div className="min-w-0">
                    <Heading as="div" variant="panel" className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Today
                    </Heading>
                    <MetaText as="p" className="mt-1">{format(today, "EEEE, MMM d")}</MetaText>
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
            </PanelHeader>
            <PanelBody className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <SkeletonBlock key={index} className="h-14" />
                        ))}
                    </div>
                ) : todayEvents.length > 0 ? (
                    <div className="space-y-2">
                        {todayEvents.map(({ schedule, task }) => {
                            const start = parseISO(schedule.startAt);
                            const end = parseISO(schedule.endAt);
                            const statusTone = getStatusTone(task?.status);
                            return (
                                <CalendarEventChip
                                    key={schedule.taskId}
                                    title={task?.title || "Untitled task"}
                                    tone={statusTone.tone}
                                    completed={task?.status === "completed"}
                                    time={`${format(start, "h:mm a")} - ${format(end, "h:mm a")}`}
                                    className="py-2"
                                />
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState
                        className="h-full min-h-[220px]"
                        icon={<CalendarDays className="h-8 w-8" />}
                        title="No events today"
                        description="Scheduled tasks for the day will appear here."
                    />
                )}
            </PanelBody>
        </Panel>
    );
}
