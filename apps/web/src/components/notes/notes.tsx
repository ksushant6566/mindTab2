import { FileText, Plus } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@mindtab/core";
import { notesQueryOptions, useDeleteNote } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { NoteDialog } from "./note-dialog";
import { CreateNoteDialog } from "./create-note-dialog";
import { NotePreview } from "./note-preview";
import type { NoteLike } from "./note-utils";

const NoteSkeleton: React.FC = () => {
    return (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {[...Array(4)].map((_, index) => (
                <div
                    key={index}
                    className="min-h-[220px] rounded-[var(--r-3)] border border-border bg-card p-4"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-3">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-5 w-48" />
                        </div>
                        <Skeleton className="h-7 w-24 rounded-[var(--r-2)]" />
                    </div>
                    <div className="mt-5 space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-11/12" />
                        <Skeleton className="h-3 w-4/5" />
                        <Skeleton className="h-3 w-3/5" />
                    </div>
                    <div className="mt-7 flex gap-2">
                        <Skeleton className="h-6 w-24 rounded-[var(--r-2)]" />
                        <Skeleton className="h-6 w-20 rounded-[var(--r-2)]" />
                    </div>
                </div>
            ))}
        </div>
    );
};

export const Notes: React.FC = () => {
    const { activeProjectId } = useAppStore();

    const { data: notes, isFetching: isFetchingNotes } = useQuery(
        notesQueryOptions(activeProjectId ? { projectId: activeProjectId } : undefined)
    );

    const notesList = useMemo(() => ((notes as NoteLike[]) ?? []), [notes]);
    const {
        mutate: deleteNote,
        isPending: isDeletingNote,
        variables: deleteNoteVariables,
    } = useDeleteNote();

    const [mode, setMode] = useState<"edit" | "view" | null>(null);
    const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
    const [isCreateNoteDialogOpen, setIsCreateNoteDialogOpen] = useState(false);
    const [currentNote, setCurrentNote] = useState<NoteLike | null>(null);

    const onCreateNote = () => setIsCreateNoteDialogOpen(true);

    const onNoteDialogOpenChange = (open: boolean) => {
        setIsNoteDialogOpen(open);
        if (!open) {
            setCurrentNote(null);
            setMode(null);
        }
    };

    const onCreateNoteDialogOpenChange = (open: boolean) => setIsCreateNoteDialogOpen(open);

    const openNote = useCallback(
        (id: string, nextMode: "edit" | "view") => {
            const note = notesList.find((item) => item.id === id);
            if (!note) return;

            setCurrentNote(note);
            setMode(nextMode);
            setIsNoteDialogOpen(true);
        },
        [notesList]
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        Notes · {notesList.length}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                        {activeProjectId ? "Project notes" : "All notes"}
                    </div>
                </div>
                <Button
                    onClick={onCreateNote}
                    size="sm"
                    className="gap-2"
                    variant="secondary"
                >
                    <Plus className="h-4 w-4" />
                    Add Note
                </Button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
                {isFetchingNotes ? (
                    <NoteSkeleton />
                ) : notesList.length === 0 ? (
                    <div className="rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-elev)]/55 px-4 py-12 text-center">
                        <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
                        <div className="mt-3 text-sm font-medium text-foreground">No notes yet</div>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4 gap-2"
                            onClick={onCreateNote}
                        >
                            <Plus className="h-4 w-4" />
                            Add First Note
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2">
                        {notesList.map((note) => (
                            <NotePreview
                                key={note.id}
                                note={note}
                                onOpenNote={(id) => openNote(id, "view")}
                                onEditNote={(id) => openNote(id, "edit")}
                                deleteNote={(id) => deleteNote(id)}
                                isDeletingNote={isDeletingNote}
                                deleteNoteVariables={deleteNoteVariables as string | undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            <NoteDialog
                isOpen={isNoteDialogOpen}
                onOpenChange={onNoteDialogOpenChange}
                defaultMode={mode}
                note={currentNote}
            />
            <CreateNoteDialog
                isOpen={isCreateNoteDialogOpen}
                onOpenChange={onCreateNoteDialogOpenChange}
                activeProjectId={activeProjectId}
            />
        </div>
    );
};
