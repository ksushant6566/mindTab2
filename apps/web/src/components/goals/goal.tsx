import { type CheckedState } from "@radix-ui/react-checkbox";
import {
    CheckCircle2,
    Clock,
    Edit3,
    Flag,
    FolderOpen,
    GripVertical,
    Save,
    Trash2,
    X,
    Zap,
} from "lucide-react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "~/components/ui/select";
import { cn, getTimeAgo } from "~/lib/utils";

type TGoal = {
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

const statusMeta = {
    pending: { label: "To Do", shortcut: "T", hint: "Define the next move", tone: "var(--text-3)" },
    in_progress: { label: "In Progress", shortcut: "I", hint: "Currently in motion", tone: "var(--cyan)" },
    completed: { label: "Done", shortcut: "D", hint: "Ready to archive", tone: "var(--amber)" },
    archived: { label: "Archive", shortcut: "A", hint: "Stored out of view", tone: "var(--text-4)" },
} as const;

const priorityOptions = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
const impactOptions = ["high", "medium", "low"] as const;

const DESCRIPTION_MIN_HEIGHT = 80;
const DESCRIPTION_MAX_HEIGHT = 180;

const pickerTriggerClassName = "h-8 gap-2 rounded-[var(--r-2)] border-input bg-background px-2 text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5";
const pickerContentClassName = "border-border bg-[var(--bg-elev)] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]";
const pickerItemClassName = "h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-xs text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]";

type PriorityMeta = (typeof priorityMeta)[keyof typeof priorityMeta];
type ImpactMeta = (typeof impactMeta)[keyof typeof impactMeta];

interface GoalProps {
    goal: TGoal;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, goal: Record<string, unknown>) => void;
    isDeleting: boolean;
    deleteVariables?: string;
    surface?: "list" | "kanban";
    isDragging?: boolean;
    isOverlay?: boolean;
    dragHandleRef?: React.Ref<HTMLButtonElement>;
    dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export const Goal: React.FC<GoalProps> = ({
    goal,
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
}) => {
    return (
        <GoalCard
            goal={goal}
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
        />
    );
};

const GoalCard: React.FC<Required<Pick<GoalProps, "goal" | "onEdit" | "onDelete" | "onToggleStatus" | "isDeleting" | "surface">> & Pick<GoalProps, "onUpdate" | "deleteVariables" | "isDragging" | "isOverlay" | "dragHandleRef" | "dragHandleProps">> = ({
    goal,
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
}) => {
    const { data: projects } = useQuery(projectsQueryOptions());
    const descriptionRef = React.useRef<HTMLTextAreaElement>(null);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [mode, setMode] = React.useState<"view" | "edit">("view");
    const [formData, setFormData] = React.useState({
        title: goal.title || "",
        description: goal.description || "",
        priority: goal.priority || "priority_4",
        impact: goal.impact || "low",
        status: goal.status || "pending",
        projectId: goal.projectId ?? goal.project?.id ?? null,
    });

    React.useEffect(() => {
        setFormData({
            title: goal.title || "",
            description: goal.description || "",
            priority: goal.priority || "priority_4",
            impact: goal.impact || "low",
            status: goal.status || "pending",
            projectId: goal.projectId ?? goal.project?.id ?? null,
        });
        setMode("view");
    }, [goal.id, goal.title, goal.description, goal.priority, goal.impact, goal.status, goal.projectId, goal.project?.id]);

    const resizeDescriptionTextarea = React.useCallback((element: HTMLTextAreaElement | null = descriptionRef.current, animate = true) => {
        if (!element) return;

        const previousHeight = element.offsetHeight || DESCRIPTION_MIN_HEIGHT;
        element.style.height = "auto";
        const contentHeight = element.scrollHeight;
        const nextHeight = Math.max(DESCRIPTION_MIN_HEIGHT, Math.min(contentHeight, DESCRIPTION_MAX_HEIGHT));
        const shouldScroll = contentHeight > DESCRIPTION_MAX_HEIGHT;

        const applyHeight = () => {
            element.style.height = `${nextHeight}px`;
            element.style.overflowY = shouldScroll ? "auto" : "hidden";
        };

        if (!animate || Math.abs(previousHeight - nextHeight) <= 1) {
            applyHeight();
            return;
        }

        element.style.height = `${previousHeight}px`;
        element.style.overflowY = "hidden";
        void element.offsetHeight;

        requestAnimationFrame(applyHeight);
    }, []);

    React.useLayoutEffect(() => {
        if (dialogOpen && mode === "edit") {
            resizeDescriptionTextarea(descriptionRef.current, false);
        }
    }, [dialogOpen, mode, resizeDescriptionTextarea]);

    const completed = ["completed", "archived"].includes(goal.status);
    const priority = priorityMeta[goal.priority as keyof typeof priorityMeta] ?? priorityMeta.priority_4;
    const impact = impactMeta[goal.impact as keyof typeof impactMeta] ?? impactMeta.low;
    const status = statusMeta[goal.status as keyof typeof statusMeta] ?? statusMeta.pending;
    const projectName = goal.project?.name || goal.projectName;
    const goalCode = goal.key || goal.code || `GOAL-${String(goal.id).slice(0, 4).toUpperCase()}`;

    const saveInlineEdit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!formData.title.trim()) return;

        if (onUpdate) {
            onUpdate(goal.id, {
                title: formData.title.trim(),
                description: formData.description.trim() || undefined,
                priority: formData.priority,
                impact: formData.impact,
                status: formData.status,
                projectId: formData.projectId,
            });
            setMode("view");
            setDialogOpen(true);
            return;
        }

        onEdit(goal.id);
    };

    return (
        <>
        <article
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
            <div className={cn("grid grid-cols-[28px_1fr_auto] gap-2 p-3", surface === "list" && "gap-3 px-3.5 py-3")}>
                <div className="flex flex-col items-center gap-2 pt-0.5">
                    <button
                        ref={dragHandleRef}
                        type="button"
                        aria-label={`Drag ${goal.title}`}
                        {...dragHandleProps}
                        className="flex size-6 cursor-grab items-center justify-center rounded-[var(--r-2)] text-muted-foreground opacity-45 transition-all hover:bg-secondary hover:text-foreground group-hover/card:opacity-100 active:cursor-grabbing"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <Checkbox
                        id={goal.id}
                        className="size-4 rounded-[var(--r-1)] border-[var(--border-2)] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground [&_svg]:size-3"
                        checked={completed}
                        onCheckedChange={(checked) => onToggleStatus(goal.id, checked)}
                        aria-label={`Move ${goal.title} to the next status`}
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
                        <div className="min-w-0">
                            <div className={cn("truncate text-[13.5px] font-medium leading-5 tracking-normal text-foreground", completed && "text-muted-foreground line-through decoration-muted-foreground/70")}>
                                {goal.title}
                            </div>
                            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                                <span>{goalCode}</span>
                                {projectName && (
                                    <>
                                        <span className="text-[var(--text-4)]">·</span>
                                        <span className="max-w-[120px] truncate lowercase">{projectName}</span>
                                    </>
                                )}
                                <span className="text-[var(--text-4)]">·</span>
                                <PriorityMark priority={priority} />
                                <span className="text-[var(--text-4)]">·</span>
                                <ImpactMark impact={impact} />
                            </div>
                            {surface === "list" && goal.description && (
                                <p className={cn("mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground", completed && "line-through decoration-muted-foreground/60")}>
                                    {goal.description}
                                </p>
                            )}
                        </div>
                        <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: priority.tone }} />
                    </div>
                </button>

                <div className="flex items-start gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-[var(--r-2)]"
                        onClick={() => {
                            setDialogOpen(true);
                            setMode("edit");
                        }}
                        aria-label={`Edit ${goal.title}`}
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-[var(--r-2)] text-muted-foreground hover:text-[var(--rose)]"
                        onClick={() => onDelete(goal.id)}
                        disabled={isDeleting && deleteVariables === goal.id}
                        aria-label={`Delete ${goal.title}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

        </article>
        {!isOverlay && (
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setMode("view");
                }}
            >
                <DialogContent className="max-w-2xl overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)]">
                    <DialogHeader className="border-b border-border px-5 py-4 text-left">
                        <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                            {goal.title}
                        </DialogTitle>
                        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                            <span>{goalCode}</span>
                            {projectName && (
                                <>
                                    <span className="text-[var(--text-4)]">·</span>
                                    <span className="lowercase">{projectName}</span>
                                </>
                            )}
                            <span className="text-[var(--text-4)]">·</span>
                            <span>{status.label}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-[var(--bg)]/45 px-5 pb-5 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
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
                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{status.label}</span>
                        </div>
                    </div>

                    {mode === "view" ? (
                        <div className="space-y-3">
                            <p className="text-sm leading-5 text-muted-foreground">
                                {goal.description || "No description yet. Open edit mode to add a sharper next action."}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <KanbanDetail label="Priority" value={priority.label}>
                                    <PriorityMark priority={priority} />
                                </KanbanDetail>
                                <KanbanDetail label="Impact" value={impact.label}>
                                    <ImpactMark impact={impact} />
                                </KanbanDetail>
                                <KanbanDetail label="Project" value={projectName || "None"} icon={<FolderOpen className="h-3 w-3" />} />
                                <KanbanDetail label="Created" value={goal.createdAt ? getTimeAgo(new Date(goal.createdAt)) : "Unknown"} icon={<Clock className="h-3 w-3" />} />
                            </div>
                            <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{status.hint}</div>
                                        <div className="mt-0.5 text-xs text-foreground">Click the checkbox to advance this goal.</div>
                                    </div>
                                    <span className="flex size-6 items-center justify-center rounded-[var(--r-2)] border border-border bg-background font-mono text-[10px] text-muted-foreground">
                                        {status.shortcut}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form className="space-y-3" onSubmit={saveInlineEdit}>
                            <input
                                value={formData.title}
                                onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                                className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                                placeholder="Goal title"
                                autoFocus
                            />
                            <textarea
                                ref={descriptionRef}
                                value={formData.description}
                                onChange={(event) => {
                                    setFormData((prev) => ({ ...prev, description: event.target.value }));
                                    resizeDescriptionTextarea(event.currentTarget);
                                }}
                                className="min-h-20 max-h-[180px] w-full resize-none rounded-[var(--r-2)] border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground outline-none transition-[height,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] placeholder:text-muted-foreground focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                                placeholder="What does done look like?"
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
                                <KanbanSelect
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
                                <KanbanSelect
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
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setMode("view")}>
                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm" className="h-8" disabled={!formData.title.trim()}>
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                    Save
                                </Button>
                            </div>
                        </form>
                    )}
                    </div>
                </DialogContent>
            </Dialog>
        )}
        </>
    );
};

function KanbanDetail({
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
                            <SelectItem
                                key={option}
                                value={option}
                                className={pickerItemClassName}
                            >
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
    const selectedImpact = impactMeta[value as keyof typeof impactMeta] ?? impactMeta.low;

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
                            <SelectItem
                                key={option}
                                value={option}
                                className={pickerItemClassName}
                            >
                                <ImpactMark impact={impactMeta[option]} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

type KanbanSelectKind = "plain" | "status" | "project";

function KanbanSelect({
    kind = "plain",
    label,
    value,
    onChange,
    options,
}: {
    kind?: KanbanSelectKind;
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
                        <KanbanOptionMark kind={kind} value={value} label={selectedLabel} />
                    </div>
                </SelectTrigger>
                <SelectContent className={pickerContentClassName}>
                    <SelectGroup>
                        {options.map(([optionValue, optionLabel]) => (
                            <SelectItem key={optionValue} value={optionValue} className={pickerItemClassName}>
                                <KanbanOptionMark kind={kind} value={optionValue} label={optionLabel} />
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

function KanbanOptionMark({
    kind,
    value,
    label,
}: {
    kind: KanbanSelectKind;
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
