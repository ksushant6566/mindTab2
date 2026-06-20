import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    CalendarDays,
    CheckCircle2,
    Clock,
    Flag,
    FolderOpen,
    Link2Off,
    Plus,
    Save,
    X,
    Zap,
} from "lucide-react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "~/components/ui/select";
import { RichTextEditor } from "~/components/text-editor";
import { cn, getTimeAgo } from "~/lib/utils";
import { isRichTextEmpty, sanitizeRichText } from "~/lib/rich-text";
import { formatScheduleRange, useCalendarSchedules } from "~/lib/calendar-schedules";
import {
    createScheduleDraft,
    getScheduleDraftPayload,
    isScheduleDraftValid,
    TaskScheduleFields,
    type TaskScheduleDraft,
} from "./task-schedule-fields";

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

const statusMeta = {
    pending: { label: "To Do", shortcut: "T", hint: "Define the next move", tone: "var(--text-3)" },
    in_progress: { label: "In Progress", shortcut: "I", hint: "Currently in motion", tone: "var(--cyan)" },
    completed: { label: "Done", shortcut: "D", hint: "Ready to archive", tone: "var(--amber)" },
    archived: { label: "Archive", shortcut: "A", hint: "Stored out of view", tone: "var(--text-4)" },
} as const;

const priorityOptions = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
const impactOptions = ["high", "medium", "low"] as const;

const pickerTriggerClassName = "h-8 gap-2 rounded-[var(--r-2)] border-input bg-background px-2 text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5";
const pickerContentClassName = "border-border bg-[var(--bg-elev)] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]";
const pickerItemClassName = "h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-xs text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]";

type PriorityMeta = (typeof priorityMeta)[keyof typeof priorityMeta];
type ImpactMeta = (typeof impactMeta)[keyof typeof impactMeta];

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
    defaultValues = {},
    onCreate,
    onUpdate,
    onDelete,
    onToggleStatus,
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

    React.useEffect(() => {
        if (!open) return;
        const nextSchedule = defaultValues.schedule ?? createScheduleDraft(schedule);
        setMode(initialMode);
        setFormData(buildFormData(task, defaultValues, nextSchedule));
    }, [
        defaultValues.description,
        defaultValues.impact,
        defaultValues.priority,
        defaultValues.projectId,
        defaultValues.schedule?.enabled,
        defaultValues.schedule?.endAt,
        defaultValues.schedule?.startAt,
        defaultValues.status,
        defaultValues.title,
        initialMode,
        open,
        schedule?.endAt,
        schedule?.startAt,
        task,
    ]);

    const isCreate = mode === "create";
    const isFormMode = mode === "create" || mode === "edit";
    const currentStatus = statusMeta[(isFormMode ? formData.status : task?.status) as keyof typeof statusMeta] ?? statusMeta.pending;
    const priority = priorityMeta[(task?.priority ?? formData.priority) as keyof typeof priorityMeta] ?? priorityMeta.priority_4;
    const impact = impactMeta[(task?.impact ?? formData.impact) as keyof typeof impactMeta] ?? impactMeta.medium;
    const projectName = task?.project?.name || task?.projectName;
    const taskCode = getTaskCode(task);
    const scheduleLabel = schedule ? formatScheduleRange(schedule) : "Not scheduled";
    const descriptionHtml = React.useMemo(() => sanitizeRichText(task?.description), [task?.description]);
    const hasDescription = !isRichTextEmpty(task?.description);

    const close = () => onOpenChange(false);

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
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                onOpenChange(nextOpen);
                if (!nextOpen && initialMode !== "create") setMode("view");
            }}
        >
            <DialogContent className="max-w-2xl overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {dialogTitle}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <span>{taskCode}</span>
                        {(projectName || isCreate) && (
                            <>
                                <span className="text-[var(--text-4)]">·</span>
                                <span className="lowercase">{projectName || "new task"}</span>
                            </>
                        )}
                        <span className="text-[var(--text-4)]">·</span>
                        <span>{currentStatus.label}</span>
                    </DialogDescription>
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
                                            "h-6 rounded-[calc(var(--r-2)-1px)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                                            mode === item && "bg-primary text-primary-foreground"
                                        )}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="inline-flex h-7 items-center rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                Create
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{currentStatus.label}</span>
                        </div>
                    </div>

                    {mode === "view" && task ? (
                        <div className="space-y-3">
                            {hasDescription ? (
                                <article
                                    className="task-description-prose text-sm leading-5 text-muted-foreground"
                                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                                />
                            ) : (
                                <p className="text-sm leading-5 text-muted-foreground">
                                    No description yet. Open edit mode to add a sharper next action.
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <TaskDetail label="Priority" value={priority.label}>
                                    <PriorityMark priority={priority} />
                                </TaskDetail>
                                <TaskDetail label="Impact" value={impact.label}>
                                    <ImpactMark impact={impact} />
                                </TaskDetail>
                                <TaskDetail label="Project" value={projectName || "None"} icon={<FolderOpen className="h-3 w-3" />} />
                                <TaskDetail label="Created" value={task.createdAt ? getTimeAgo(new Date(task.createdAt)) : "Unknown"} icon={<Clock className="h-3 w-3" />} />
                            </div>
                            <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                            <CalendarDays className="h-3 w-3" />
                                            <span>Calendar</span>
                                        </div>
                                        <div className="mt-1 truncate text-xs text-foreground">{scheduleLabel}</div>
                                    </div>
                                    {schedule && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-xs"
                                            onClick={() => unscheduleTask(task.id)}
                                        >
                                            <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                                            Unlink
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{currentStatus.hint}</div>
                                        <div className="mt-0.5 text-xs text-foreground">Click the checkbox to advance this task.</div>
                                    </div>
                                    <span className="flex size-6 items-center justify-center rounded-[var(--r-2)] border border-border bg-background font-mono text-[10px] text-muted-foreground">
                                        {currentStatus.shortcut}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                {onDelete && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-muted-foreground hover:text-[var(--rose)]"
                                        onClick={() => task && onDelete(task.id)}
                                        disabled={isDeleting && deleteVariables === task.id}
                                    >
                                        Delete
                                    </Button>
                                )}
                                {onToggleStatus && (
                                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onToggleStatus(task.id, false)}>
                                        Advance
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {isFormMode ? (
                        <form className="space-y-3" onSubmit={handleSubmit}>
                            <input
                                value={formData.title}
                                onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                                className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                                placeholder="Task title"
                                autoFocus
                            />
                            <RichTextEditor
                                content={formData.description}
                                onContentChange={(description) => setFormData((prev) => ({ ...prev, description }))}
                                placeholder="What does done look like?"
                                className="task-description-editor overflow-hidden rounded-[var(--r-2)] border border-input bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--ink-line)] focus-within:ring-2 focus-within:ring-ring/30"
                            />
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <PriorityPicker
                                    value={formData.priority}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
                                />
                                <ImpactPicker
                                    value={formData.impact}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, impact: value }))}
                                />
                                <TaskSelect
                                    kind="status"
                                    label="Status"
                                    value={formData.status}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                                    options={[
                                        ["pending", "To Do"],
                                        ["in_progress", "In Progress"],
                                        ["completed", "Done"],
                                        ["archived", "Archive"],
                                    ]}
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
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                {icon}
                {children || (
                    <span className="truncate" style={tone ? { color: tone } : undefined}>{value}</span>
                )}
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

function PriorityPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const selectedPriority = priorityMeta[value as keyof typeof priorityMeta] ?? priorityMeta.priority_4;

    return (
        <div className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Priority</span>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className={pickerTriggerClassName}>
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                        <PriorityMark priority={selectedPriority} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {priorityOptions.map((option) => (
                            <SelectItem key={option} value={option} className={pickerItemClassName}>
                                <PriorityMark priority={priorityMeta[option]} />
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
    const selectedImpact = impactMeta[value as keyof typeof impactMeta] ?? impactMeta.medium;

    return (
        <div className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Impact</span>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className={pickerTriggerClassName}>
                    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                        <ImpactMark impact={selectedImpact} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {impactOptions.map((option) => (
                            <SelectItem key={option} value={option} className={pickerItemClassName}>
                                <ImpactMark impact={impactMeta[option]} />
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
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
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
        const status = statusMeta[value as keyof typeof statusMeta] ?? statusMeta.pending;

        return (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium leading-none text-foreground">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: status.tone }} />
                <span className="truncate">{label}</span>
            </span>
        );
    }

    if (kind === "project") {
        return (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium leading-none text-foreground">
                <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
            </span>
        );
    }

    return (
        <span className="inline-flex min-w-0 items-center text-xs font-medium leading-none text-foreground">
            <span className="truncate">{label}</span>
        </span>
    );
}
