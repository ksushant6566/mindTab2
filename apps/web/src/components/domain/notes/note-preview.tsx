import { useMemo } from "react";
import { NotePreviewCard, type NoteMentionItem } from "~/components/domain/notes";
import { getTimeAgo } from "~/lib/utils";
import { sanitizeRichText } from "~/lib/rich-text";
import {
    countWords,
    formatNoteDate,
    getNoteProjectName,
    getMentionedItems,
    type NoteLike,
} from "./note-utils";

type NoteProps = {
    note: NoteLike;
    onOpenNote: (id: string) => void;
    onEditNote: (id: string) => void;
    deleteNote: (id: string) => void;
    isDeletingNote: boolean;
    deleteNoteVariables: string | undefined;
};

export const NotePreview = ({
    note,
    onOpenNote,
    onEditNote,
    deleteNote,
    isDeletingNote,
    deleteNoteVariables,
}: NoteProps) => {
    const projectName = getNoteProjectName(note);
    const updatedAt = note.updatedAt || note.createdAt;
    const updatedLabel = updatedAt ? getTimeAgo(new Date(updatedAt)) : "Unknown";
    const wordCount = useMemo(() => countWords(note.content), [note.content]);
    const contentHtml = useMemo(() => sanitizeRichText(note.content), [note.content]);
    const mentionedItems = useMemo<NoteMentionItem[]>(() => {
        const mentions = getMentionedItems(note.content);
        return [...mentions.task, ...mentions.note];
    }, [note.content]);
    const isDeleting = isDeletingNote && deleteNoteVariables === note.id;

    return (
        <NotePreviewCard
            title={note.title || "Untitled note"}
            dateLabel={formatNoteDate(updatedAt)}
            updatedLabel={updatedLabel}
            projectName={projectName}
            contentHtml={contentHtml}
            wordCount={wordCount}
            mentions={mentionedItems}
            isDeleting={isDeleting}
            onOpen={() => onOpenNote(note.id)}
            onEdit={() => onEditNote(note.id)}
            onDelete={() => deleteNote(note.id)}
        />
    );
};
