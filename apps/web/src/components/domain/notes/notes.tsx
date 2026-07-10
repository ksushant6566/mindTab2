import { Plus } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notesQueryOptions, useDeleteNote } from "~/api/hooks";
import { NoteGrid, NoteSkeletonGrid, NotesEmptyState } from "~/components/domain/notes";
import { Button } from "~/components/ui/button";
import { MetaText } from "~/components/ui/typography";
import { NoteDialog } from "./note-dialog";
import { CreateNoteDialog } from "./create-note-dialog";
import { NotePreview } from "./note-preview";
import type { NoteLike } from "./note-utils";
import { useDashboardNavigation } from "~/lib/dashboard-navigation";

export const Notes: React.FC = () => {
    const { activeProjectId } = useDashboardNavigation();

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
                    <MetaText as="div">
                        Notes · {notesList.length}
                    </MetaText>
                    <MetaText as="div" className="mt-1">
                        {activeProjectId ? "Project notes" : "All notes"}
                    </MetaText>
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
                    <NoteSkeletonGrid />
                ) : notesList.length === 0 ? (
                    <NotesEmptyState
                      action={
                        <Button
                            variant="secondary"
                            size="sm"
                            className="gap-2"
                            onClick={onCreateNote}
                        >
                            <Plus className="h-4 w-4" />
                            Add First Note
                        </Button>
                      }
                    />
                ) : (
                    <NoteGrid>
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
                    </NoteGrid>
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
