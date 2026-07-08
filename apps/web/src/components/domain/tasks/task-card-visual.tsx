import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    CalendarDays,
    Edit3,
    GripVertical,
    Link2Off,
    Trash2,
} from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { CodeText, Text } from "~/components/ui/typography";
import { ImpactBadge, PriorityBadge } from "~/components/ui/tone-badge";
import { cn } from "~/lib/utils";

export type TaskCardTask = {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    impact: string;
    status: string;
    position?: number | null;
    projectId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    project?: {
        id?: string | null;
        name?: string | null;
        status?: string | null;
    } | null;
    [key: string]: any;
};

type TaskCardVisualProps = {
    task: TaskCardTask;
    surface?: "list" | "kanban";
    isDragging?: boolean;
    isOverlay?: boolean;
    hideDragHandle?: boolean;
    showCalendarActions?: boolean;
    hasSchedule?: boolean;
    nativeDragTaskId?: string;
    dragHandleRef?: React.Ref<HTMLButtonElement>;
    dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    onNativeDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
    onOpen?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onUnschedule?: () => void;
    onToggleStatus?: (checked: CheckedState) => void;
    isDeleting?: boolean;
    readOnly?: boolean;
};

export const TaskCardVisual = React.forwardRef<HTMLElement, TaskCardVisualProps>(function TaskCardVisual({
    task,
    surface = "list",
    isDragging = false,
    isOverlay = false,
    hideDragHandle = false,
    showCalendarActions = false,
    hasSchedule = false,
    nativeDragTaskId,
    dragHandleRef,
    dragHandleProps,
    onNativeDragStart,
    onOpen,
    onEdit,
    onDelete,
    onUnschedule,
    onToggleStatus,
    isDeleting = false,
    readOnly = false,
}, ref) {
    const completed = ["completed", "archived"].includes(task.status);
    const projectName = task.project?.name || task.projectName;
    const taskCode = task.key || task.code || `TASK-${String(task.id).slice(0, 4).toUpperCase()}`;
    const actionSpace = showCalendarActions && hasSchedule ? "wide" : "normal";

    const content = (
        <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
                <Text as="div" variant="body" className={cn("truncate", completed && "text-muted-foreground line-through decoration-muted-foreground/70")}>
                    {task.title}
                </Text>
                <TaskMetadata
                    taskCode={taskCode}
                    projectName={projectName}
                    priority={task.priority}
                    impact={task.impact}
                    surface={surface}
                    actionSpace={actionSpace}
                />
            </div>
        </div>
    );

    return (
        <article
            ref={ref}
            className={cn(
                "group/card relative overflow-hidden rounded-[var(--r-3)] border border-border bg-card text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--overlay-subtle)]",
                surface === "list" && "bg-[var(--bg-elev)]/65",
                "hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[var(--shadow-card-hover)]",
                isDragging && "scale-[0.985] border-dashed opacity-30",
                isOverlay && "rotate-[0.35deg] shadow-[var(--shadow-popover)]"
            )}
        >
            <div className={cn("grid grid-cols-[28px_minmax(0,1fr)] gap-2 p-3", surface === "list" && "gap-3 px-3.5 py-3")}>
                <div className="flex flex-col items-center gap-2 pt-0.5">
                    {hideDragHandle ? (
                        <span className="flex size-6 items-center justify-center rounded-[var(--r-2)] text-muted-foreground/60">
                            <CalendarDays className="h-3.5 w-3.5" />
                        </span>
                    ) : (
                        <button
                            ref={dragHandleRef}
                            type="button"
                            aria-label={`Drag ${task.title}`}
                            {...dragHandleProps}
                            draggable={!readOnly && !!nativeDragTaskId}
                            onDragStart={readOnly ? undefined : onNativeDragStart}
                            className={cn(
                                "flex size-6 cursor-grab items-center justify-center rounded-[var(--r-2)] text-muted-foreground opacity-45 transition-all hover:bg-secondary hover:text-foreground group-hover/card:opacity-100 active:cursor-grabbing",
                                nativeDragTaskId && "opacity-70 hover:bg-primary/10 hover:text-primary",
                                readOnly && "cursor-default"
                            )}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <GripVertical className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <Checkbox
                        id={readOnly ? undefined : task.id}
                        className="size-4 rounded-[var(--r-1)] border-[var(--border-2)] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground [&_svg]:size-3"
                        checked={completed}
                        onCheckedChange={readOnly ? undefined : onToggleStatus}
                        aria-disabled={readOnly}
                        aria-label={`Move ${task.title} to the next status`}
                    />
                </div>

                {readOnly ? (
                    <div className="min-w-0 text-left" aria-label={task.title}>
                        {content}
                    </div>
                ) : (
                    <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => !isOverlay && onOpen?.()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onOpen?.();
                            }
                        }}
                        aria-haspopup="dialog"
                    >
                        {content}
                    </button>
                )}

                {!readOnly && (
                    <div className="absolute bottom-1.5 right-2.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                        {showCalendarActions && hasSchedule && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-foreground"
                                onClick={onUnschedule}
                                aria-label={`Unlink ${task.title} from calendar`}
                            >
                                <Link2Off className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[var(--r-2)]"
                            onClick={onEdit}
                            aria-label={`Edit ${task.title}`}
                        >
                            <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--tone-danger)]"
                            onClick={onDelete}
                            disabled={isDeleting}
                            aria-label={`Delete ${task.title}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>
        </article>
    );
});

function TaskMetadata({
    taskCode,
    projectName,
    priority,
    impact,
    surface,
    actionSpace,
}: {
    taskCode: string;
    projectName?: string | null;
    priority?: string | null;
    impact?: string | null;
    surface: "list" | "kanban";
    actionSpace: "normal" | "wide";
}) {
    const actionSpaceClassName = actionSpace === "wide" ? "pr-24" : "pr-16";

    return (
        <div className={cn("grid min-w-0 gap-1 text-muted-foreground", surface === "list" ? "mt-1" : "mt-0.5")}>
            <div className="flex min-w-0 items-center gap-2">
                <CodeText className="shrink-0 uppercase tracking-[0.04em]">{taskCode}</CodeText>
                {projectName && (
                    <>
                        <span className="shrink-0 text-[var(--text-4)]">·</span>
                        <Text as="span" variant="subtle" className="min-w-0 truncate lowercase">{projectName}</Text>
                    </>
                )}
            </div>
            <div className={cn("flex min-w-0 items-center gap-2", actionSpaceClassName)}>
                <PriorityBadge priority={priority} />
                <span className="shrink-0 text-[var(--text-4)]">·</span>
                <ImpactBadge impact={impact} />
            </div>
        </div>
    );
}
