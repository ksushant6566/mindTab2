import { useQuery } from "@tanstack/react-query";
import {
    Clock3,
    FileText,
    FolderOpen,
    Save,
    Target,
    X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { projectsQueryOptions, useUpdateNote } from "~/api/hooks";
import { TipTapEditor } from "~/components/text-editor";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { cn, getTimeAgo } from "~/lib/utils";
import { sanitizeRichText } from "~/lib/rich-text";
import { NoteProjectSelect } from "./note-project-select";
import {
    countWords,
    getNoteProjectName,
    getMentionedItems,
    type NoteLike,
    type MentionType,
    type MentionedItem,
} from "./note-utils";

type TNoteDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    defaultMode: "edit" | "view" | null;
    note: NoteLike | null;
};

const mentionMeta: Record<
    MentionType,
    {
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        className: string;
    }
> = {
    task: {
        label: "Task",
        icon: Target,
        className: "text-[var(--green)]",
    },
    note: {
        label: "Note",
        icon: FileText,
        className: "text-[var(--amber)]",
    },
};

export const NoteDialog = ({
    isOpen,
    onOpenChange,
    defaultMode,
    note,
}: TNoteDialogProps) => {
    const { data: projects } = useQuery(projectsQueryOptions());
    const [mode, setMode] = useState<"edit" | "view">(defaultMode ?? "view");
    const [info, setInfo] = useState({
        id: note?.id ?? "",
        title: note?.title ?? "",
        content: note?.content ?? "",
        projectId: note?.projectId ?? null,
    });

    const { mutate: updateNote, isPending: isUpdatingNote } = useUpdateNote();

    useEffect(() => {
        if (!isOpen) return;

        setMode(defaultMode ?? "view");
        setInfo({
            id: note?.id ?? "",
            title: note?.title ?? "",
            content: note?.content ?? "",
            projectId: note?.projectId ?? null,
        });
    }, [defaultMode, isOpen, note]);

    const mentionedItems = useMemo(() => {
        const mentions = getMentionedItems(info.content);
        return [...mentions.task, ...mentions.note];
    }, [info.content]);

    const wordCount = useMemo(() => countWords(info.content), [info.content]);
    const contentHtml = useMemo(() => sanitizeRichText(info.content), [info.content]);

    if (!note) return null;

    const selectedProject = (projects as any[])?.find((project: any) => project.id === info.projectId);
    const projectName = selectedProject?.name || getNoteProjectName(note);
    const updatedAt = note.updatedAt || note.createdAt;
    const updatedLabel = updatedAt ? getTimeAgo(new Date(updatedAt)) : "Unknown";
    const displayTitle = info.title.trim() || "Untitled note";

    const resetInfo = () => {
        setInfo({
            id: note.id,
            title: note.title ?? "",
            content: note.content ?? "",
            projectId: note.projectId ?? null,
        });
    };

    const handleSubmit = () => {
        if (!info.title.trim() || !info.content) return;

        updateNote(
            {
                id: note.id,
                content: info.content,
                title: info.title.trim(),
                projectId: info.projectId,
            } as any,
            {
                onSuccess: () => setMode("view"),
                onError: (error: any) => toast.error(error.message || "Failed to update note"),
            }
        );
    };

    const handleCancel = () => {
        resetInfo();
        if (defaultMode === "edit") {
            onOpenChange(false);
            return;
        }
        setMode("view");
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] max-w-4xl gap-0 overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)] sm:rounded-[var(--r-4)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {displayTitle}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <span>Note</span>
                        <span className="text-[var(--text-4)]">·</span>
                        <span>{projectName || "No project"}</span>
                        <span className="text-[var(--text-4)]">·</span>
                        <span>Updated {updatedLabel}</span>
                    </DialogDescription>
                </DialogHeader>

                <div
                    className="min-h-0 bg-[var(--bg)]/45 px-5 pb-5 pt-4"
                    onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                            event.preventDefault();
                            handleSubmit();
                        }
                    }}
                >
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <ModeSwitch mode={mode} onChange={setMode} />
                        {mode === "edit" ? (
                            <NoteProjectSelect
                                value={info.projectId}
                                projects={projects as any[]}
                                onValueChange={(projectId) => setInfo((current) => ({ ...current, projectId }))}
                                className="w-[220px]"
                            />
                        ) : (
                            <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                <FolderOpen className="h-3 w-3 text-[var(--cyan)]" />
                                <span className="truncate">{projectName || "No project"}</span>
                            </div>
                        )}
                    </div>

                    {mode === "view" ? (
                        <div className="custom-scrollbar max-h-[min(58vh,540px)] min-w-0 overflow-auto rounded-[var(--r-3)] border border-border bg-background">
                            <article
                                className="note-prose px-4 py-4"
                                dangerouslySetInnerHTML={{ __html: contentHtml || "<p>No content yet.</p>" }}
                            />
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-[var(--r-3)] border border-border bg-background">
                            <TipTapEditor
                                content={info.content}
                                onContentChange={(content) => setInfo((current) => ({ ...current, content }))}
                                title={info.title}
                                onTitleChange={(title) => setInfo((current) => ({ ...current, title }))}
                                editable
                                className="note-editor"
                                titleClassName="text-lg"
                            />
                        </div>
                    )}

                    {mode === "view" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                                <Clock3 className="h-3 w-3" />
                                {wordCount} words
                            </span>
                            {projectName && (
                                <span className="inline-flex max-w-[170px] items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--cyan)]">
                                    <FolderOpen className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{projectName}</span>
                                </span>
                            )}
                            <MentionPills items={mentionedItems} />
                        </div>
                    ) : (
                        <DialogFooter className="mt-4 gap-2 sm:space-x-0">
                            <Button
                                type="button"
                                onClick={handleCancel}
                                size="sm"
                                variant="ghost"
                                className="gap-2"
                            >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                size="sm"
                                className="gap-2"
                                disabled={isUpdatingNote || !info.title.trim() || !info.content}
                                loading={isUpdatingNote}
                            >
                                <Save className="h-3.5 w-3.5" />
                                Save
                            </Button>
                        </DialogFooter>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

function ModeSwitch({
    mode,
    onChange,
}: {
    mode: "view" | "edit";
    onChange: (mode: "view" | "edit") => void;
}) {
    return (
        <div className="inline-flex rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] p-0.5">
            {(["view", "edit"] as const).map((item) => (
                <button
                    key={item}
                    type="button"
                    onClick={() => onChange(item)}
                    className={cn(
                        "h-6 rounded-[calc(var(--r-2)-1px)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                        mode === item && "bg-primary text-primary-foreground"
                    )}
                >
                    {item}
                </button>
            ))}
        </div>
    );
}

function MentionPills({ items }: { items: MentionedItem[] }) {
    if (!items.length) return null;

    return (
        <>
            {items.slice(0, 8).map((item) => {
                const meta = mentionMeta[item.type];
                const Icon = meta.icon;

                return (
                    <span
                        key={`${item.type}-${item.id}`}
                        className={cn(
                            "inline-flex max-w-[170px] items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em]",
                            meta.className
                        )}
                    >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.label || meta.label}</span>
                    </span>
                );
            })}
            {items.length > 8 && (
                <span className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                    +{items.length - 8}
                </span>
            )}
        </>
    );
}
