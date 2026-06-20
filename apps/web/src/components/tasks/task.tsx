import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    CalendarDays,
    Edit3,
    Flag,
    GripVertical,
    Link2Off,
    Trash2,
    Zap,
} from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { TaskDialog } from "./task-dialog";

type TTask = {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    impact: string;
    status: string;
    position: number;
    projectId: string | null;
    createdAt: string;
    updatedAt: string;
    project?: {
        id: string;
        name: string | null;
        status: string;
    } | null;
    [key: string]: any;
};

const priorityMeta = {
    priority_1: { label: "P1", tone: "var(--rose)" },
    priority_2: { label: "P2", tone: "var(--amber)" },
    priority_3: { label: "P3", tone: "var(--cyan)" },
    priority_4: { label: "P4", tone: "var(--text-3)" },
} as const;

const impactMeta = {
    low: { label: "Low", dots: 1, tone: "var(--text-3)" },
    medium: { label: "Medium", dots: 2, tone: "var(--cyan)" },
    high: { label: "High", dots: 3, tone: "var(--amber)" },
} as const;

type PriorityMeta = (typeof priorityMeta)[keyof typeof priorityMeta];
type ImpactMeta = (typeof impactMeta)[keyof typeof impactMeta];

interface TaskProps {
    task: TTask;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, task: Record<string, unknown>) => void;
    isDeleting: boolean;
    deleteVariables?: string;
    surface?: "list" | "kanban";
    isDragging?: boolean;
    isOverlay?: boolean;
    dragHandleRef?: React.Ref<HTMLButtonElement>;
    dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    hideDragHandle?: boolean;
    showCalendarActions?: boolean;
    nativeDragTaskId?: string;
}

export const Task: React.FC<TaskProps> = ({
    task,
    onEdit,
    onDelete,
    onToggleStatus,
    onUpdate,
    isDeleting,
    deleteVariables,
    surface = "list",
    isDragging = false,
    isOverlay = false,
    dragHandleRef,
    dragHandleProps,
    hideDragHandle = false,
    showCalendarActions = false,
    nativeDragTaskId,
}) => {
    return (
        <TaskCard
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            onUpdate={onUpdate}
            isDeleting={isDeleting}
            deleteVariables={deleteVariables}
            surface={surface}
            isDragging={isDragging}
            isOverlay={isOverlay}
            dragHandleRef={dragHandleRef}
            dragHandleProps={dragHandleProps}
            hideDragHandle={hideDragHandle}
            showCalendarActions={showCalendarActions}
            nativeDragTaskId={nativeDragTaskId}
        />
    );
};

const TaskCard: React.FC<Required<Pick<TaskProps, "task" | "onEdit" | "onDelete" | "onToggleStatus" | "isDeleting" | "surface" | "hideDragHandle" | "showCalendarActions">> & Pick<TaskProps, "onUpdate" | "deleteVariables" | "isDragging" | "isOverlay" | "dragHandleRef" | "dragHandleProps" | "nativeDragTaskId">> = ({
    task,
    onEdit,
    onDelete,
    onToggleStatus,
    onUpdate,
    isDeleting,
    deleteVariables,
    surface,
    isDragging,
    isOverlay,
    dragHandleRef,
    dragHandleProps,
    hideDragHandle,
    showCalendarActions,
    nativeDragTaskId,
}) => {
    const { schedules, unscheduleTask } = useCalendarSchedules();
    const cardRef = React.useRef<HTMLElement>(null);
    const schedule = schedules[task.id];
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [mode, setMode] = React.useState<"view" | "edit">("view");

    const completed = ["completed", "archived"].includes(task.status);
    const priority = priorityMeta[task.priority as keyof typeof priorityMeta] ?? priorityMeta.priority_4;
    const impact = impactMeta[task.impact as keyof typeof impactMeta] ?? impactMeta.low;
    const projectName = task.project?.name || task.projectName;
    const taskCode = task.key || task.code || `TASK-${String(task.id).slice(0, 4).toUpperCase()}`;

    const handleNativeDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
        if (!nativeDragTaskId) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", nativeDragTaskId);

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
            className={cn(
                "group/card relative overflow-hidden rounded-[var(--r-3)] border border-border bg-card text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/[0.04]",
                surface === "list" && "bg-[var(--bg-elev)]/65",
                dialogOpen
                    ? "border-[var(--border-2)] bg-[var(--bg-elev)] shadow-[0_12px_32px_-28px_rgba(0,0,0,0.9)]"
                    : "hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[0_10px_28px_-26px_rgba(0,0,0,0.85)]",
                isDragging && "scale-[0.985] border-dashed opacity-30",
                isOverlay && "rotate-[0.35deg] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.9)]"
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
                            draggable={!!nativeDragTaskId}
                            onDragStart={handleNativeDragStart}
                            className={cn(
                                "flex size-6 cursor-grab items-center justify-center rounded-[var(--r-2)] text-muted-foreground opacity-45 transition-all hover:bg-secondary hover:text-foreground group-hover/card:opacity-100 active:cursor-grabbing",
                                nativeDragTaskId && "opacity-70 hover:bg-primary/10 hover:text-primary"
                            )}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <GripVertical className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <Checkbox
                        id={task.id}
                        className="size-4 rounded-[var(--r-1)] border-[var(--border-2)] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground [&_svg]:size-3"
                        checked={completed}
                        onCheckedChange={(checked) => onToggleStatus(task.id, checked)}
                        aria-label={`Move ${task.title} to the next status`}
                    />
                </div>

                <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => !isOverlay && setDialogOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setDialogOpen(true);
                        }
                    }}
                    aria-expanded={dialogOpen}
                    aria-haspopup="dialog"
                >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className={cn("truncate text-[13.5px] font-medium leading-5 tracking-normal text-foreground", completed && "text-muted-foreground line-through decoration-muted-foreground/70")}>
                                {task.title}
                            </div>
                            <TaskMetadata
                                taskCode={taskCode}
                                projectName={projectName}
                                priority={priority}
                                impact={impact}
                                surface={surface}
                                actionSpace={showCalendarActions && schedule ? "wide" : "normal"}
                            />
                        </div>
                    </div>
                </button>

                <div className="absolute bottom-1.5 right-2.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                    {showCalendarActions && schedule && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-foreground"
                            onClick={() => unscheduleTask(task.id)}
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
                        onClick={() => {
                            setDialogOpen(true);
                            setMode("edit");
                        }}
                        aria-label={`Edit ${task.title}`}
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--rose)]"
                        onClick={() => onDelete(task.id)}
                        disabled={isDeleting && deleteVariables === task.id}
                        aria-label={`Delete ${task.title}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

        </article>
        {!isOverlay && (
            <TaskDialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setMode("view");
                }}
                mode={mode}
                task={task}
                onUpdate={(taskId, values) => {
                    if (onUpdate) onUpdate(taskId, values);
                    else onEdit(taskId);
                }}
                onDelete={onDelete}
                onToggleStatus={onToggleStatus}
                isDeleting={isDeleting}
                deleteVariables={deleteVariables}
            />
        )}
        </>
    );
};

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
    priority: PriorityMeta;
    impact: ImpactMeta;
    surface: NonNullable<TaskProps["surface"]>;
    actionSpace: "normal" | "wide";
}) {
    const actionSpaceClassName = actionSpace === "wide" ? "pr-24" : "pr-16";

    return (
        <div className={cn("grid min-w-0 gap-1 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground", surface === "list" ? "mt-1" : "mt-0.5")}>
            <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{taskCode}</span>
                {projectName && (
                    <>
                        <span className="shrink-0 text-[var(--text-4)]">·</span>
                        <span className="min-w-0 truncate lowercase">{projectName}</span>
                    </>
                )}
            </div>
            <div className={cn("flex min-w-0 items-center gap-2", actionSpaceClassName)}>
                <PriorityMark priority={priority} />
                <span className="shrink-0 text-[var(--text-4)]">·</span>
                <ImpactMark impact={impact} />
            </div>
        </div>
    );
}

function PriorityMark({ priority }: { priority: PriorityMeta }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.04em]" style={{ color: priority.tone }}>
            <Flag className="h-3 w-3 shrink-0" fill="currentColor" />
            <span className="truncate">{priority.label}</span>
        </span>
    );
}

function ImpactMark({ impact }: { impact: ImpactMeta }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.04em]" style={{ color: impact.tone }}>
            <span className="inline-flex shrink-0 items-center gap-0.5">
                {Array.from({ length: impact.dots }).map((_, index) => (
                    <Zap key={index} className="h-3 w-3" fill="currentColor" />
                ))}
            </span>
            <span className="truncate">{impact.label}</span>
        </span>
    );
}
