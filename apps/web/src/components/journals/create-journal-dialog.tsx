import { useQuery } from "@tanstack/react-query";
import { FileText, Save, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { projectsQueryOptions, useCreateJournal } from "~/api/hooks";
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
import { JournalProjectSelect } from "./journal-project-select";

type TCreateJournalDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    activeProjectId?: string | null;
};

export const CreateJournalDialog = ({
    isOpen,
    onOpenChange,
    activeProjectId,
}: TCreateJournalDialogProps) => {
    const { data: projects } = useQuery(projectsQueryOptions());
    const [info, setInfo] = useState({
        title: "",
        content: "",
        projectId: activeProjectId || null,
    });

    const createJournalMutation = useCreateJournal();
    const isCreatingJournal = createJournalMutation.isPending;

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

        createJournalMutation.mutate(
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
            <DialogContent className="max-h-[88vh] max-w-4xl gap-0 overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)] sm:rounded-[var(--r-4)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        New Note
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>Note</span>
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
                    <div className="mb-3 flex justify-end">
                        <JournalProjectSelect
                            value={info.projectId}
                            projects={projects as any[]}
                            onValueChange={(projectId) => setInfo((current) => ({ ...current, projectId }))}
                            className="w-[220px]"
                        />
                    </div>

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
                            disabled={isCreatingJournal || !info.title.trim() || !info.content}
                            loading={isCreatingJournal}
                        >
                            <Save className="h-3.5 w-3.5" />
                            Create
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
};
