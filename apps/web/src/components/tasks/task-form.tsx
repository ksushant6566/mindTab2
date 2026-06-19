import { type ChangeEvent, type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { CheckCircle2, Flag, FolderOpen, Plus, Save, X, Zap } from "lucide-react";
import { TASK_IMPACT, TASK_PRIORITY } from "@mindtab/shared";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { RichTextEditor } from "~/components/text-editor";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { cn, handleCmdEnterSubmit } from "~/lib/utils";
import { isRichTextEmpty, sanitizeRichText } from "~/lib/rich-text";

type TaskFormProps = {
    mode: "create" | "edit";
    task?: any;
    defaultValues?: Partial<any>;
    onSave: (task: any) => void;
    onCancel: () => void;
    loading?: boolean;
    showHeader?: boolean;
};

const priorityColors = {
    priority_1: "var(--rose)",
    priority_2: "var(--amber)",
    priority_3: "var(--green)",
    priority_4: "var(--text-3)",
} as const;

const impactNumber = {
    low: 1,
    medium: 2,
    high: 3,
} as const;

const formatPriority = (priority?: string) => priority?.replace("_", " ") ?? "priority";

export function TaskForm({
    mode,
    task,
    defaultValues,
    onSave,
    onCancel,
    loading,
    showHeader = false,
}: TaskFormProps) {
    const { data: projects } = useQuery(projectsQueryOptions());
    const [formData, setFormData] = useState<any>({
        id: task?.id,
        title: task?.title ?? defaultValues?.title ?? "",
        description: task?.description ?? defaultValues?.description ?? "",
        priority: task?.priority ?? defaultValues?.priority ?? TASK_PRIORITY[0],
        impact: task?.impact ?? defaultValues?.impact ?? TASK_IMPACT[1],
        status: task?.status ?? defaultValues?.status ?? "pending",
        projectId: task?.projectId ?? task?.project?.id ?? defaultValues?.projectId ?? null,
        position: task?.position ?? defaultValues?.position,
        completedAt: task?.completedAt ?? defaultValues?.completedAt,
    });

    const titleRef = useRef<HTMLInputElement>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const title = String(formData.title ?? "").trim();
        if (!title) return;

        onSave({
            ...formData,
            title,
            description: isRichTextEmpty(formData.description) ? "" : sanitizeRichText(formData.description),
            projectId: formData.projectId || null,
        });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            titleRef.current?.focus();
        }
    };

    const projectName = formData.projectId
        ? (projects as any[])?.find((project: any) => project.id === formData.projectId)?.name || "Project"
        : "No Project";

    return (
        <form onSubmit={handleSubmit} onKeyDown={handleCmdEnterSubmit} className="overflow-hidden">
            {showHeader && (
                <div className="border-b border-border px-5 py-4">
                    <h2 className="text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {mode === "create" ? "New Task" : "Edit Task"}
                    </h2>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Task</span>
                    </div>
                </div>
            )}

            <div className={cn("space-y-3", showHeader && "bg-[var(--bg)]/45 px-5 pb-5 pt-4")}>
                <input
                    type="text"
                    id={mode === "create" ? "create-task-title" : "edit-task-title"}
                    name="title"
                    placeholder="Task"
                    value={formData.title || ""}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    required
                    className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                    ref={titleRef}
                    autoFocus
                />
                <RichTextEditor
                    content={formData.description || ""}
                    onContentChange={(description) => setFormData((prev: any) => ({ ...prev, description }))}
                    placeholder="Description"
                    className="task-description-editor overflow-hidden rounded-[var(--r-2)] border border-input bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--ink-line)] focus-within:ring-2 focus-within:ring-ring/30"
                    editorContentClassName="w-full"
                />

                <div className="grid gap-2 sm:grid-cols-3">
                    <Select
                        onValueChange={(value) => setFormData((prev: any) => ({ ...prev, priority: value }))}
                        value={formData.priority}
                    >
                        <SelectTrigger className="h-9 rounded-[var(--r-2)] border-input bg-background text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0">
                            <SelectValue placeholder="Priority">
                                <span className="flex min-w-0 items-center gap-2 capitalize">
                                    <Flag
                                        className="h-3.5 w-3.5 shrink-0"
                                        color={priorityColors[formData.priority as keyof typeof priorityColors]}
                                        fill={priorityColors[formData.priority as keyof typeof priorityColors]}
                                    />
                                    <span className="truncate">{formatPriority(formData.priority)}</span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover text-sm">
                            <SelectGroup>
                                <SelectLabel>Priority</SelectLabel>
                                {TASK_PRIORITY.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        <span className="flex items-center gap-2 capitalize">
                                            <Flag className="h-3.5 w-3.5" color={priorityColors[value]} fill={priorityColors[value]} />
                                            {formatPriority(value)}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>

                    <Select
                        onValueChange={(value) => setFormData((prev: any) => ({ ...prev, impact: value }))}
                        value={formData.impact}
                    >
                        <SelectTrigger className="h-9 rounded-[var(--r-2)] border-input bg-background text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0">
                            <SelectValue placeholder="Impact">
                                <span className="flex min-w-0 items-center gap-1 capitalize">
                                    <span className="truncate">{formData.impact}</span>
                                    {Array.from({ length: impactNumber[formData.impact as keyof typeof impactNumber] ?? 1 }).map((_, index) => (
                                        <Zap key={index} className="h-3 w-3 shrink-0 text-[var(--amber)]" fill="var(--amber)" />
                                    ))}
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover text-sm">
                            <SelectGroup>
                                <SelectLabel>Impact</SelectLabel>
                                {[...TASK_IMPACT].reverse().map((value) => (
                                    <SelectItem key={value} value={value}>
                                        <span className="flex items-center gap-1 capitalize">
                                            <span className="mr-1">{value}</span>
                                            {Array.from({ length: impactNumber[value] }).map((_, index) => (
                                                <Zap key={index} className="h-3 w-3 text-[var(--amber)]" fill="var(--amber)" />
                                            ))}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>

                    <Select
                        onValueChange={(value) => setFormData((prev: any) => ({ ...prev, projectId: value === "none" ? null : value }))}
                        value={formData.projectId || "none"}
                    >
                        <SelectTrigger className="h-9 rounded-[var(--r-2)] border-input bg-background text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0">
                            <SelectValue placeholder="Project">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{projectName}</span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover text-sm">
                            <SelectGroup>
                                <SelectLabel>Project</SelectLabel>
                                <SelectItem value="none">No Project</SelectItem>
                                {(projects as any[])?.map((project: any) => (
                                    <SelectItem key={project.id} value={project.id}>
                                        <span className="flex items-center gap-2">
                                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                            {project.name || "Unnamed Project"}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="h-8" onClick={onCancel} type="button" disabled={loading}>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                    </Button>
                    <Button size="sm" type="submit" className="h-8" disabled={loading || !String(formData.title ?? "").trim()} loading={loading}>
                        {mode === "create" ? <Plus className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        {mode === "create" ? "Add Task" : "Save"}
                    </Button>
                </div>
            </div>
        </form>
    );
}
