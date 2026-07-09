import { Edit3, GripVertical, Trash2 } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { DeleteTaskConfirmDialog } from "~/components/tasks/delete-task-confirm-dialog";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ImpactBadge, PriorityBadge, StatusBadge } from "~/components/ui/tone-badge";
import { CodeText, Heading, MetaText, Text } from "~/components/ui/typography";
import { cn } from "~/lib/utils";

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

function getTaskProjectName(task: SchedulingTrayTask) {
    return task.project?.name || task.projectName || "No project";
}

function getTaskCode(task: SchedulingTrayTask) {
    return task.key || task.code || `TASK-${String(task.id).slice(0, 4).toUpperCase()}`;
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
                        <SchedulingTaskCard
                            key={task.id}
                            task={task}
                            onOpen={() => onEditTask(task.id, "view")}
                            onEdit={() => onEditTask(task.id, "edit")}
                            onDelete={() => onDeleteTask(task.id)}
                            isDeleting={isDeleting && deleteVariables === task.id}
                        />
                    ))
                )}
            </div>
        </aside>
    );
}

function SchedulingTaskCard({
    task,
    onOpen,
    onEdit,
    onDelete,
    isDeleting,
}: {
    task: SchedulingTrayTask;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}) {
    const cardRef = useRef<HTMLElement | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const projectName = getTaskProjectName(task);

    const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);

        const card = cardRef.current;
        if (card) {
            const rect = card.getBoundingClientRect();
            event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
        }
    };

    return (
        <>
            <article
                ref={cardRef}
                className="group/card relative overflow-hidden rounded-[var(--r-3)] border border-border bg-card/80 text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--overlay-subtle)] hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[var(--shadow-card-hover)]"
            >
                <div className="grid min-h-[88px] grid-cols-[34px_minmax(0,1fr)] gap-2.5 px-2.5 py-2.5">
                    <button
                        type="button"
                        draggable
                        onDragStart={handleDragStart}
                        className="flex h-full cursor-grab items-center justify-center rounded-[var(--r-2)] border border-transparent text-muted-foreground/65 transition-colors hover:border-border hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
                        aria-label={`Drag ${task.title || "task"} onto the calendar`}
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                        type="button"
                        className="min-w-0 self-center pr-14 text-left"
                        onClick={onOpen}
                        aria-haspopup="dialog"
                    >
                        <div className="min-w-0">
                            <Text as="div" variant="body" className="truncate leading-[1.25]">
                                {task.title || "Untitled task"}
                            </Text>
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                                <CodeText className="shrink-0 uppercase tracking-[0.04em]">
                                    {getTaskCode(task)}
                                </CodeText>
                                <span className="shrink-0 text-[var(--text-4)]">·</span>
                                <Text as="span" variant="subtle" className="min-w-0 max-w-[150px] truncate lowercase">
                                    {projectName}
                                </Text>
                            </div>
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                                <StatusBadge status={task.status} className="min-w-0 shrink" />
                                <span className="shrink-0 text-[var(--text-4)]">·</span>
                                <PriorityBadge priority={task.priority} className="min-w-0 shrink" />
                                <span className="shrink-0 text-[var(--text-4)]">·</span>
                                <ImpactBadge impact={task.impact} className="min-w-0 shrink" />
                            </div>
                        </div>
                    </button>

                    <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[var(--r-2)] bg-card/90 text-muted-foreground shadow-[var(--shadow-inset)] hover:text-foreground"
                            onClick={onEdit}
                            aria-label={`Edit ${task.title || "task"}`}
                        >
                            <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[var(--r-2)] bg-card/90 text-muted-foreground shadow-[var(--shadow-inset)] hover:text-[var(--tone-danger)]"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={isDeleting}
                            aria-label={`Delete ${task.title || "task"}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </article>
            <DeleteTaskConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                taskTitle={task.title}
                task={task as any}
                isDeleting={isDeleting}
                onConfirm={() => {
                    onDelete();
                    setDeleteConfirmOpen(false);
                }}
            />
        </>
    );
}
