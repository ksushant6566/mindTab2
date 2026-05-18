import { FileText, Plus } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@mindtab/core";
import { journalsQueryOptions, useDeleteJournal } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { JournalDialog } from "./journal-dialog";
import { CreateJournalDialog } from "./create-journal-dialog";
import { JournalPreview } from "./journal-preview";
import type { JournalLike } from "./note-utils";

const JournalSkeleton: React.FC = () => {
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

export const Journals: React.FC = () => {
    const { activeProjectId } = useAppStore();

    const { data: journals, isFetching: isFetchingJournals } = useQuery(
        journalsQueryOptions(activeProjectId ? { projectId: activeProjectId } : undefined)
    );

    const journalsList = useMemo(() => ((journals as JournalLike[]) ?? []), [journals]);
    const {
        mutate: deleteJournal,
        isPending: isDeletingJournal,
        variables: deleteJournalVariables,
    } = useDeleteJournal();

    const [mode, setMode] = useState<"edit" | "view" | null>(null);
    const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false);
    const [isCreateJournalDialogOpen, setIsCreateJournalDialogOpen] = useState(false);
    const [currentJournal, setCurrentJournal] = useState<JournalLike | null>(null);

    const onCreateJournal = () => setIsCreateJournalDialogOpen(true);

    const onJournalDialogOpenChange = (open: boolean) => {
        setIsJournalDialogOpen(open);
        if (!open) {
            setCurrentJournal(null);
            setMode(null);
        }
    };

    const onCreateJournalDialogOpenChange = (open: boolean) => setIsCreateJournalDialogOpen(open);

    const openJournal = useCallback(
        (id: string, nextMode: "edit" | "view") => {
            const journal = journalsList.find((item) => item.id === id);
            if (!journal) return;

            setCurrentJournal(journal);
            setMode(nextMode);
            setIsJournalDialogOpen(true);
        },
        [journalsList]
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        Notes · {journalsList.length}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                        {activeProjectId ? "Project notes" : "All notes"}
                    </div>
                </div>
                <Button
                    onClick={onCreateJournal}
                    size="sm"
                    className="gap-2"
                    variant="secondary"
                >
                    <Plus className="h-4 w-4" />
                    Add Note
                </Button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
                {isFetchingJournals ? (
                    <JournalSkeleton />
                ) : journalsList.length === 0 ? (
                    <div className="rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-elev)]/55 px-4 py-12 text-center">
                        <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
                        <div className="mt-3 text-sm font-medium text-foreground">No notes yet</div>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4 gap-2"
                            onClick={onCreateJournal}
                        >
                            <Plus className="h-4 w-4" />
                            Add First Note
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2">
                        {journalsList.map((journal) => (
                            <JournalPreview
                                key={journal.id}
                                journal={journal}
                                onOpenJournal={(id) => openJournal(id, "view")}
                                onEditJournal={(id) => openJournal(id, "edit")}
                                deleteJournal={(id) => deleteJournal(id)}
                                isDeletingJournal={isDeletingJournal}
                                deleteJournalVariables={deleteJournalVariables as string | undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            <JournalDialog
                isOpen={isJournalDialogOpen}
                onOpenChange={onJournalDialogOpenChange}
                defaultMode={mode}
                journal={currentJournal}
            />
            <CreateJournalDialog
                isOpen={isCreateJournalDialogOpen}
                onOpenChange={onCreateJournalDialogOpenChange}
                activeProjectId={activeProjectId}
            />
        </div>
    );
};
