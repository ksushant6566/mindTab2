import React, { useMemo } from "react";
import { Task } from "~/components/tasks/task";
import { type TaskCardTask } from "~/components/tasks/task-card-visual";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Heading, MetaText, Text } from "~/components/ui/typography";

export type SchedulingTrayTask = {
    id: string;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    impact?: string | null;
    projectName?: string | null;
    key?: string | null;
    code?: string | null;
    project?: {
        id?: string | null;
        name?: string | null;
    } | null;
};

export type SchedulingTrayProject = {
    id: string;
    name?: string | null;
};

export type PlanningStatusFilter = "all" | "in_progress" | "pending";

const PLANNING_STATUS_FILTERS: Array<{ value: PlanningStatusFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "In progress" },
    { value: "pending", label: "To do" },
];

function toTaskCardTask(task: SchedulingTrayTask): TaskCardTask {
    return {
        ...task,
        title: task.title || "Untitled task",
        description: null,
        status: task.status || "pending",
        priority: task.priority || "priority_4",
        impact: task.impact || "low",
    };
}

type SchedulingTrayProps = {
    tasks: SchedulingTrayTask[];
    statusCountTasks: SchedulingTrayTask[];
    projects: SchedulingTrayProject[];
    projectFilter: string;
    statusFilter: PlanningStatusFilter;
    onProjectFilterChange: (value: string) => void;
    onStatusFilterChange: (value: PlanningStatusFilter) => void;
    onEditTask: (taskId: string, mode?: "view" | "edit") => void;
    onDeleteTask: (taskId: string) => void;
    isDeleting: boolean;
    deleteVariables?: string;
};

export function SchedulingTray({
    tasks,
    statusCountTasks,
    projects,
    projectFilter,
    statusFilter,
    onProjectFilterChange,
    onStatusFilterChange,
    onEditTask,
    onDeleteTask,
    isDeleting,
    deleteVariables,
}: SchedulingTrayProps) {
    const statusCounts = useMemo(
        () => ({
            all: statusCountTasks.length,
            in_progress: statusCountTasks.filter((task) => task.status === "in_progress").length,
            pending: statusCountTasks.filter((task) => task.status === "pending").length,
        }),
        [statusCountTasks]
    );

    return (
        <aside className="flex w-[336px] shrink-0 flex-col gap-3">
            <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <Heading as="div" variant="panel" className="truncate">
                            Unscheduled
                        </Heading>
                        <MetaText as="div" className="mt-0.5">
                            {statusCounts.all} active {statusCounts.all === 1 ? "task" : "tasks"}
                        </MetaText>
                    </div>
                    <Select value={projectFilter} onValueChange={onProjectFilterChange}>
                        <SelectTrigger className="h-8 w-[150px] shrink-0 px-2">
                            <SelectValue placeholder="All projects" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All projects</SelectItem>
                            <SelectItem value="unassigned">No project</SelectItem>
                            {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                    {project.name || "Untitled project"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <MetaText as="div" className="truncate text-muted-foreground/70">
                    Plan by dragging tasks onto the calendar.
                </MetaText>
            </div>

            <SegmentedControl
                aria-label="Filter unscheduled tasks"
                value={statusFilter}
                options={PLANNING_STATUS_FILTERS.map((filter) => ({
                    value: filter.value,
                    label: `${filter.label} ${statusCounts[filter.value]}`,
                }))}
                onValueChange={onStatusFilterChange}
                className="w-full"
                itemClassName="flex-1"
            />

            <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                {tasks.length === 0 ? (
                    <div className="rounded-[var(--r-2)] border border-dashed border-border px-3 py-5 text-center">
                        <Text variant="muted">No active unscheduled tasks match this filter.</Text>
                    </div>
                ) : (
                    tasks.map((task) => (
                        <Task
                            key={task.id}
                            task={toTaskCardTask(task)}
                            onEdit={onEditTask}
                            onDelete={onDeleteTask}
                            isDeleting={isDeleting}
                            deleteVariables={deleteVariables}
                            cardVariant="planning"
                            surface="kanban"
                            nativeDragTaskId={task.id}
                        />
                    ))
                )}
            </div>
        </aside>
    );
}
