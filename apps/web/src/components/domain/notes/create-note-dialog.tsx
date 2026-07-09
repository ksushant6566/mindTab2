import { useQuery } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { projectsQueryOptions, useCreateNote } from "~/api/hooks";
import { NoteDialogBody, NoteDialogContentFrame, NoteEditorSurface, NoteKindMeta } from "~/components/domain/notes";
import { TipTapEditor } from "~/components/text-editor";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { NoteProjectSelect } from "./note-project-select";

type TCreateNoteDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    activeProjectId?: string | null;
};

export const CreateNoteDialog = ({
    isOpen,
    onOpenChange,
    activeProjectId,
}: TCreateNoteDialogProps) => {
    const { data: projects } = useQuery(projectsQueryOptions());
    const [info, setInfo] = useState({
        title: "",
        content: "",
        projectId: activeProjectId || null,
    });

    const createNoteMutation = useCreateNote();
    const isCreatingNote = createNoteMutation.isPending;

    useEffect(() => {
        if (isOpen) {
            setInfo({
                title: "",
                content: "",
                projectId: activeProjectId || null,
            });
        }
    }, [isOpen, activeProjectId]);

    const handleSubmit = () => {
        if (!info.title.trim() || !info.content) return;

        createNoteMutation.mutate(
            {
                title: info.title.trim(),
                content: info.content,
                ...(info.projectId && { projectId: info.projectId }),
            } as any,
            {
                onSuccess: () => {
                    onOpenChange(false);
                    setInfo({
                        title: "",
                        content: "",
                        projectId: activeProjectId || null,
                    });
                },
                onError: (error: any) => {
                    toast.error(error.message || "Failed to create note");
                },
            }
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <NoteDialogContentFrame>
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8">
                        New Note
                    </DialogTitle>
                    <DialogDescription>
                        <NoteKindMeta />
                    </DialogDescription>
                </DialogHeader>

                <NoteDialogBody onSubmit={handleSubmit}>
                    <div className="mb-3 flex justify-end">
                        <NoteProjectSelect
                            value={info.projectId}
                            projects={projects as any[]}
                            onValueChange={(projectId) => setInfo((current) => ({ ...current, projectId }))}
                        />
                    </div>

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

                    <DialogFooter className="mt-4 gap-2 sm:space-x-0">
                        <Button
                            type="button"
                            onClick={() => onOpenChange(false)}
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
                            disabled={isCreatingNote || !info.title.trim() || !info.content}
                            loading={isCreatingNote}
                        >
                            <Save className="h-3.5 w-3.5" />
                            Create
                        </Button>
                    </DialogFooter>
                </NoteDialogBody>
            </NoteDialogContentFrame>
        </Dialog>
    );
};
