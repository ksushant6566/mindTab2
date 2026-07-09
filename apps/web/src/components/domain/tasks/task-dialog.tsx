import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    CalendarDays,
    Clock,
    FolderOpen,
    Link2Off,
    Plus,
    Save,
    Trash2,
    X,
} from "lucide-react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "~/components/ui/select";
import { CodeText, Heading, MetaText, Text } from "~/components/ui/typography";
import { ImpactBadge, PriorityBadge, StatusBadge } from "~/components/ui/tone-badge";
import { RichTextEditor } from "~/components/text-editor";
import { cn, getTimeAgo } from "~/lib/utils";
import { isRichTextEmpty, sanitizeRichText } from "~/lib/rich-text";
import { formatScheduleRange, useCalendarSchedules } from "~/lib/calendar-schedules";
import { getImpactTone, getPriorityTone, getStatusTone } from "~/lib/tones";
import {
    createScheduleDraft,
    getScheduleDraftPayload,
    isScheduleDraftValid,
    TaskScheduleFields,
    type TaskScheduleDraft,
} from "./task-schedule-fields";
import { DeleteTaskConfirmDialog } from "./delete-task-confirm-dialog";

export type TaskDialogMode = "create" | "view" | "edit";

export type TaskDialogTask = {
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

export type TaskDialogInput = {
    title: string;
    description?: string;
    priority: string;
    impact: string;
    status?: string;
    position?: number;
    projectId?: string | null;
    completedAt?: string;
    schedule?: TaskScheduleDraft;
};

type TaskDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: TaskDialogMode;
    task?: TaskDialogTask | null;
    defaultValues?: Partial<TaskDialogInput>;
    onCreate?: (task: TaskDialogInput) => void;
    onUpdate?: (id: string, task: Record<string, unknown>) => void;
    onDelete?: (id: string) => void;
    onToggleStatus?: (id: string, checked: CheckedState) => void;
    isSaving?: boolean;
    isDeleting?: boolean;
    deleteVariables?: string;
};

const EMPTY_TASK_DEFAULT_VALUES: Partial<TaskDialogInput> = {};

const priorityOptions = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
const impactOptions = ["high", "medium", "low"] as const;
const statusOptions = [
    ["pending", "To Do"],
    ["in_progress", "In Progress"],
    ["completed", "Done"],
    ["archived", "Archive"],
] as const;

const pickerTriggerClassName = "h-8 gap-2 rounded-[var(--r-2)] border-input bg-background px-2 text-[length:var(--type-meta-size)] focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5";
const pickerContentClassName = "border-border bg-[var(--bg-elev)] shadow-[var(--shadow-popover)]";
const pickerItemClassName = "h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-[length:var(--type-meta-size)] text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]";

function getStatusStyle(status: ReturnType<typeof getStatusTone>): React.CSSProperties {
    return {
        "--task-dialog-status-color": status.tone,
        "--task-dialog-status-bg": status.background,
    } as React.CSSProperties;
}

function getTaskProjectId(task?: TaskDialogTask | null) {
    return task?.projectId ?? task?.project?.id ?? null;
}

function getTaskCode(task?: TaskDialogTask | null) {
    if (!task) return "NEW";
    return task.key || task.code || `TASK-${String(task.id).slice(0, 4).toUpperCase()}`;
}

function buildFormData(task: TaskDialogTask | null | undefined, defaultValues: Partial<TaskDialogInput>, schedule: ReturnType<typeof createScheduleDraft>) {
    return {
        title: task?.title ?? defaultValues.title ?? "",
        description: task?.description ?? defaultValues.description ?? "",
        priority: task?.priority ?? defaultValues.priority ?? "priority_4",
        impact: task?.impact ?? defaultValues.impact ?? "medium",
        status: task?.status ?? defaultValues.status ?? "pending",
        projectId: getTaskProjectId(task) ?? defaultValues.projectId ?? null,
        schedule,
    };
}

export function TaskDialog({
    open,
    onOpenChange,
    mode: initialMode,
    task,
    defaultValues = EMPTY_TASK_DEFAULT_VALUES,
    onCreate,
    onUpdate,
    onDelete,
    isSaving = false,
    isDeleting = false,
    deleteVariables,
}: TaskDialogProps) {
    const { data: projects } = useQuery(projectsQueryOptions());
    const { schedules, scheduleTask, unscheduleTask } = useCalendarSchedules();
    const schedule = task?.id ? schedules[task.id] : undefined;
    const defaultSchedule = defaultValues.schedule ?? createScheduleDraft(schedule);
    const [mode, setMode] = React.useState<TaskDialogMode>(initialMode);
    const [formData, setFormData] = React.useState(() => buildFormData(task, defaultValues, defaultSchedule));
    const [editorResetKey, setEditorResetKey] = React.useState(0);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

    const resetForm = React.useCallback((nextMode: TaskDialogMode = initialMode) => {
        const nextSchedule = defaultValues.schedule ?? createScheduleDraft(schedule);
        setMode(nextMode);
        setFormData(buildFormData(task, defaultValues, nextSchedule));
        setEditorResetKey((key) => key + 1);
    }, [
        defaultValues.description,
        defaultValues.impact,
        defaultValues.priority,
        defaultValues.projectId,
        defaultValues.schedule,
        defaultValues.status,
        defaultValues.title,
        initialMode,
        schedule,
        task,
    ]);

    React.useEffect(() => {
        resetForm(open ? initialMode : initialMode !== "create" ? "view" : initialMode);
    }, [initialMode, open, resetForm]);

    const isCreate = mode === "create";
    const isFormMode = mode === "create" || mode === "edit";
    const statusValue = (isFormMode ? formData.status : task?.status) ?? "pending";
    const currentStatus = getStatusTone(statusValue);
    const priority = getPriorityTone(task?.priority ?? formData.priority);
    const impact = getImpactTone(task?.impact ?? formData.impact);
    const projectName = task?.project?.name || task?.projectName;
    const taskCode = getTaskCode(task);
    const scheduleLabel = schedule ? formatScheduleRange(schedule) : "Not scheduled";
    const descriptionHtml = React.useMemo(() => sanitizeRichText(task?.description), [task?.description]);
    const hasDescription = !isRichTextEmpty(task?.description);

    const close = () => onOpenChange(false);

    const handleStatusChange = (status: string) => {
        if (isFormMode || !task) {
            setFormData((prev) => ({ ...prev, status }));
            return;
        }

        onUpdate?.(task.id, { status });
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!formData.title.trim() || !isScheduleDraftValid(formData.schedule)) return;

        const description = isRichTextEmpty(formData.description) ? "" : sanitizeRichText(formData.description);
        const schedulePayload = getScheduleDraftPayload(formData.schedule);

        if (mode === "create") {
            onCreate?.({
                title: formData.title.trim(),
                description,
                priority: formData.priority,
                impact: formData.impact,
                status: formData.status,
                projectId: formData.projectId,
                schedule: schedulePayload ? formData.schedule : { ...formData.schedule, enabled: false },
            });
            return;
        }

        if (!task) return;
        onUpdate?.(task.id, {
            title: formData.title.trim(),
            description,
            priority: formData.priority,
            impact: formData.impact,
            status: formData.status,
            projectId: formData.projectId,
        });

        if (schedulePayload) {
            scheduleTask(task.id, schedulePayload.startAt, schedulePayload.durationMinutes);
        } else {
            unscheduleTask(task.id);
        }
        setMode("view");
    };

    const dialogTitle = isCreate ? "New Task" : task?.title || "Task";

    return (
        <>
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen) {
                    resetForm(initialMode);
                } else {
                    resetForm(initialMode !== "create" ? "view" : initialMode);
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-w-2xl overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[var(--shadow-dialog)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle asChild>
                      <Heading as="h2" variant="page" className="pr-8">
                        {dialogTitle}
                      </Heading>
                    </DialogTitle>
                    <div className="flex items-center justify-between gap-3">
                        <DialogDescription className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                            <CodeText className="uppercase tracking-[0.06em]">{taskCode}</CodeText>
                            {(projectName || isCreate) && (
                                <>
                                    <span className="text-[var(--text-4)]">·</span>
                                    <MetaText className="lowercase">{projectName || "new task"}</MetaText>
                                </>
                            )}
                            <span className="text-[var(--text-4)]">·</span>
                            <StatusBadge status={statusValue} />
                        </DialogDescription>
                        {!isCreate && task && onDelete && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="-mr-1 size-7 shrink-0 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--tone-danger)]"
                                onClick={() => setDeleteConfirmOpen(true)}
                                disabled={isDeleting && deleteVariables === task.id}
                                aria-label={`Delete ${task.title}`}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                <div className="bg-[var(--bg)]/45 px-5 pb-5 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        {!isCreate ? (
                            <div className="inline-flex rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] p-0.5">
                                {(["view", "edit"] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setMode(item)}
                                        className={cn(
                                            "h-6 rounded-[calc(var(--r-2)-1px)] px-2 text-[length:var(--type-meta-size)] text-muted-foreground transition-colors",
                                            mode === item && "bg-primary text-primary-foreground"
                                        )}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="inline-flex h-7 items-center rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 text-[length:var(--type-meta-size)] text-muted-foreground">
                                Create
                            </div>
                        )}
                        <StatusIndicatorSelect value={statusValue} onChange={handleStatusChange} />
                    </div>

                    {mode === "view" && task ? (
                        <div className="space-y-3">
                            {hasDescription ? (
                                <article
                                    className="task-description-prose text-[length:var(--type-body-size)] leading-[var(--type-body-line)] text-muted-foreground"
                                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                                />
                            ) : (
                                <Text variant="muted">
                                    No description yet. Open edit mode to add a sharper next action.
                                </Text>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <TaskDetail label="Priority" value={priority.label}>
                                    <PriorityBadge priority={task?.priority ?? formData.priority} />
                                </TaskDetail>
                                <TaskDetail label="Impact" value={impact.label}>
                                    <ImpactBadge impact={task?.impact ?? formData.impact} />
                                </TaskDetail>
                                <TaskDetail label="Project" value={projectName || "None"} icon={<FolderOpen className="h-3 w-3" />} />
                                <TaskDetail label="Created" value={task.createdAt ? getTimeAgo(new Date(task.createdAt)) : "Unknown"} icon={<Clock className="h-3 w-3" />} />
                            </div>
                            <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <MetaText className="flex items-center gap-1.5 text-muted-foreground">
                                            <CalendarDays className="h-3 w-3" />
                                            <span>Calendar</span>
                                        </MetaText>
                                        <MetaText as="div" className="mt-1 truncate text-foreground">{scheduleLabel}</MetaText>
                                    </div>
                                    {schedule && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-[length:var(--type-meta-size)]"
                                            onClick={() => unscheduleTask(task.id)}
                                        >
                                            <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                                            Unlink
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {isFormMode ? (
                        <form className="space-y-3" onSubmit={handleSubmit}>
                            <input
                                value={formData.title}
                                onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                                className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-[length:var(--type-body-size)] text-foreground outline-none transition-colors focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                                placeholder="Task title"
                                autoFocus
                            />
                            <RichTextEditor
                                key={`${task?.id ?? "new"}-${mode}-${editorResetKey}`}
                                content={formData.description}
                                onContentChange={(description) => setFormData((prev) => ({ ...prev, description }))}
                                placeholder="What does done look like?"
                                className="task-description-editor overflow-hidden rounded-[var(--r-2)] border border-input bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--ink-line)] focus-within:ring-2 focus-within:ring-ring/30"
                            />
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                <PriorityPicker
                                    value={formData.priority}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
                                />
                                <ImpactPicker
                                    value={formData.impact}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, impact: value }))}
                                />
                                <TaskSelect
                                    kind="project"
                                    label="Project"
                                    value={formData.projectId || "none"}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, projectId: value === "none" ? null : value }))}
                                    options={[
                                        ["none", "No Project"],
                                        ...((projects as any[]) ?? []).map((project: any) => [project.id, project.name || "Unnamed Project"] as [string, string]),
                                    ]}
                                />
                            </div>
                            <TaskScheduleFields
                                value={formData.schedule}
                                onChange={(schedule) => setFormData((prev) => ({ ...prev, schedule }))}
                            />
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={isCreate ? close : () => setMode("view")}>
                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm" className="h-8" disabled={!formData.title.trim() || !isScheduleDraftValid(formData.schedule) || isSaving} loading={isSaving}>
                                    {isCreate ? <Plus className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                                    {isCreate ? "Add Task" : "Save"}
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
        {task && onDelete && (
            <DeleteTaskConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                taskTitle={task.title}
                task={task}
                isDeleting={isDeleting && deleteVariables === task.id}
                onConfirm={() => {
                    onDelete(task.id);
                    setDeleteConfirmOpen(false);
                    onOpenChange(false);
                }}
            />
        )}
        </>
    );
}

function StatusIndicatorSelect({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const status = getStatusTone(value);

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger
                aria-label="Status"
                className={cn(
                    "h-7 w-fit min-w-0 max-w-[10.5rem] gap-1.5 rounded-[var(--r-2)] border-[var(--task-dialog-status-color)] bg-[var(--task-dialog-status-bg)] py-0 pl-2.5 pr-1.5",
                    "items-center justify-start text-[length:var(--type-meta-size)] leading-none text-[var(--task-dialog-status-color)] shadow-[inset_3px_0_0_var(--task-dialog-status-color)]",
                    "focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0 [&>svg]:text-[var(--task-dialog-status-color)] [&>svg]:opacity-100"
                )}
                style={getStatusStyle(status)}
            >
                <div className="flex min-w-0 items-center whitespace-nowrap pl-1 leading-none">
                    <span className="truncate leading-none">{status.label}</span>
                </div>
            </SelectTrigger>
            <SelectContent className={pickerContentClassName}>
                <SelectGroup>
                    {statusOptions.map(([optionValue, optionLabel]) => (
                        <SelectItem key={optionValue} value={optionValue} className={pickerItemClassName}>
                            <TaskOptionMark kind="status" value={optionValue} label={optionLabel} />
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

function TaskDetail({
    label,
    value,
    tone,
    icon,
    children,
}: {
    label: string;
    value: string;
    tone?: string;
    icon?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2.5 py-2">
            <MetaText className="text-muted-foreground/70">{label}</MetaText>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[length:var(--type-label-size)] text-foreground">
                {icon}
                {children || (
                    <span className="truncate" style={tone ? { color: tone } : undefined}>{value}</span>
                )}
            </div>
        </div>
    );
}

function PriorityPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-1">
            <MetaText className="text-muted-foreground/70">Priority</MetaText>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className={pickerTriggerClassName}>
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                        <PriorityBadge priority={value} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {priorityOptions.map((option) => (
                            <SelectItem key={option} value={option} className={pickerItemClassName}>
                                <PriorityBadge priority={option} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

function ImpactPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-1">
            <MetaText className="text-muted-foreground/70">Impact</MetaText>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className={pickerTriggerClassName}>
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                        <ImpactBadge impact={value} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {impactOptions.map((option) => (
                            <SelectItem key={option} value={option} className={pickerItemClassName}>
                                <ImpactBadge impact={option} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

type TaskSelectKind = "plain" | "status" | "project";

function TaskSelect({
    kind = "plain",
    label,
    value,
    onChange,
    options,
}: {
    kind?: TaskSelectKind;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<[string, string]>;
}) {
    const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? options[0]?.[1] ?? "Select";

    return (
        <div className="space-y-1">
            <MetaText className="text-muted-foreground/70">{label}</MetaText>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger aria-label={label} className={pickerTriggerClassName}>
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                        <TaskOptionMark kind={kind} value={value} label={selectedLabel} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {options.map(([optionValue, optionLabel]) => (
                            <SelectItem key={optionValue} value={optionValue} className={pickerItemClassName}>
                                <TaskOptionMark kind={kind} value={optionValue} label={optionLabel} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

function TaskOptionMark({
    kind,
    value,
    label,
}: {
    kind: TaskSelectKind;
    value: string;
    label: string;
}) {
    if (kind === "status") {
        const status = getStatusTone(value);

        return (
            <div
                className="flex min-w-0 items-center gap-1.5 text-[length:var(--type-meta-size)] leading-none text-[var(--task-dialog-status-color)]"
                style={getStatusStyle(status)}
            >
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--task-dialog-status-color)]" />
                <span className="truncate">{label}</span>
            </div>
        );
    }

    if (kind === "project") {
        return (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[length:var(--type-label-size)] leading-none text-foreground">
                <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
            </span>
        );
    }

    return (
        <span className="inline-flex min-w-0 items-center text-[length:var(--type-label-size)] leading-none text-foreground">
            <span className="truncate">{label}</span>
        </span>
    );
}
