import { useQuery } from "@tanstack/react-query";
import {
    FolderOpen,
    Save,
    X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { projectsQueryOptions, useUpdateNote } from "~/api/hooks";
import {
    NoteDialogHeaderMeta,
    NoteDialogBody,
    NoteDialogContentFrame,
    NoteEditorSurface,
    NoteMentionPills,
    NoteMetaPill,
    NoteModeSwitch,
    NoteProseSurface,
    type NoteMentionItem,
} from "~/components/domain/notes";
import { TipTapEditor } from "~/components/text-editor";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { getTimeAgo } from "~/lib/utils";
import { sanitizeRichText } from "~/lib/rich-text";
import { NoteProjectSelect } from "./note-project-select";
import {
    countWords,
    getNoteProjectName,
    getMentionedItems,
    type NoteLike,
} from "./note-utils";

type TNoteDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    defaultMode: "edit" | "view" | null;
    note: NoteLike | null;
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

    const mentionedItems = useMemo<NoteMentionItem[]>(() => {
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
            <NoteDialogContentFrame>
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8">
                        {displayTitle}
                    </DialogTitle>
                    <DialogDescription>
                        <NoteDialogHeaderMeta projectName={projectName} updatedLabel={updatedLabel} />
                    </DialogDescription>
                </DialogHeader>

                <NoteDialogBody onSubmit={handleSubmit}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <NoteModeSwitch mode={mode} onChange={setMode} />
                        {mode === "edit" ? (
                            <NoteProjectSelect
                                value={info.projectId}
                                projects={projects as any[]}
                                onValueChange={(projectId) => setInfo((current) => ({ ...current, projectId }))}
                            />
                        ) : (
                            <NoteMetaPill tone="project" icon={<FolderOpen className="h-3 w-3" />}>
                                {projectName || "No project"}
                            </NoteMetaPill>
                        )}
                    </div>

                    {mode === "view" ? (
                        <NoteProseSurface html={contentHtml || "<p>No content yet.</p>"} />
                    ) : (
                        <NoteEditorSurface>
                            <TipTapEditor
                                content={info.content}
                                onContentChange={(content) => setInfo((current) => ({ ...current, content }))}
                                title={info.title}
                                onTitleChange={(title) => setInfo((current) => ({ ...current, title }))}
                                editable
                                className="note-editor"
                                titleClassName="text-[length:var(--type-title-size)]"
                            />
                        </NoteEditorSurface>
                    )}

                    {mode === "view" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1">
                            <NoteMetaPill>{wordCount} words</NoteMetaPill>
                            {projectName && (
                                <NoteMetaPill tone="project" icon={<FolderOpen className="h-3 w-3 shrink-0" />}>{projectName}</NoteMetaPill>
                            )}
                            <NoteMentionPills items={mentionedItems} />
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
                </NoteDialogBody>
            </NoteDialogContentFrame>
        </Dialog>
    );
};
