import { Clock3, Edit3, FileText, FolderOpen, Repeat2, Target, Trash2 } from "lucide-react";
import React, { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { cn, getTimeAgo } from "~/lib/utils";
import {
    countWords,
    formatJournalDate,
    getJournalProjectName,
    getMentionedItems,
    type JournalLike,
    type MentionType,
} from "./note-utils";

type JournalProps = {
    journal: JournalLike;
    onOpenJournal: (id: string) => void;
    onEditJournal: (id: string) => void;
    deleteJournal: (id: string) => void;
    isDeletingJournal: boolean;
    deleteJournalVariables: string | undefined;
};

const mentionMeta: Record<
    MentionType,
    {
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        className: string;
    }
> = {
    goal: {
        label: "Goal",
        icon: Target,
        className: "text-[var(--green)]",
    },
    habit: {
        label: "Habit",
        icon: Repeat2,
        className: "text-[var(--cyan)]",
    },
    journal: {
        label: "Note",
        icon: FileText,
        className: "text-[var(--amber)]",
    },
};

export const JournalPreview = ({
    journal,
    onOpenJournal,
    onEditJournal,
    deleteJournal,
    isDeletingJournal,
    deleteJournalVariables,
}: JournalProps) => {
    const projectName = getJournalProjectName(journal);
    const updatedAt = journal.updatedAt || journal.createdAt;
    const updatedLabel = updatedAt ? getTimeAgo(new Date(updatedAt)) : "Unknown";
    const wordCount = useMemo(() => countWords(journal.content), [journal.content]);
    const mentionedItems = useMemo(() => {
        const mentions = getMentionedItems(journal.content);
        return [...mentions.goal, ...mentions.habit, ...mentions.journal];
    }, [journal.content]);
    const visibleMentions = mentionedItems.slice(0, 3);
    const hiddenMentionCount = Math.max(mentionedItems.length - visibleMentions.length, 0);
    const isDeleting = isDeletingJournal && deleteJournalVariables === journal.id;

    return (
        <article
            className={cn(
                "group/card relative min-h-[220px] overflow-hidden rounded-[var(--r-3)] border border-border bg-card p-4 text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/[0.04]",
                "hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[0_10px_28px_-26px_rgba(0,0,0,0.85)]"
            )}
        >
            <button
                type="button"
                className="absolute inset-0 z-0 rounded-[var(--r-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => onOpenJournal(journal.id)}
                aria-label={`Open ${journal.title || "note"}`}
            />

            <div className="pointer-events-none relative z-10 flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            <span>Note</span>
                            <span className="text-[var(--text-4)]">·</span>
                            <span>{formatJournalDate(updatedAt)}</span>
                        </div>
                        <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5 tracking-normal text-foreground">
                            {journal.title || "Untitled note"}
                        </h3>
                    </div>
                    {projectName && (
                        <span className="inline-flex max-w-[150px] shrink-0 items-center gap-1.5 truncate rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--cyan)]">
                            <FolderOpen className="h-3 w-3 shrink-0" />
                            <span className="truncate">{projectName}</span>
                        </span>
                    )}
                </div>

                <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
                    {journal.content ? (
                        <div
                            className="note-preview"
                            dangerouslySetInnerHTML={{ __html: journal.content }}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">No content yet.</p>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card via-card/90 to-transparent transition-colors group-hover/card:from-[var(--bg-soft)] group-hover/card:via-[var(--bg-soft)]/90" />
                </div>

                <div className="mt-4 flex min-h-7 items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            {updatedLabel}
                        </span>
                        {wordCount > 0 && (
                            <span className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                                {wordCount} words
                            </span>
                        )}
                        {visibleMentions.map((item) => {
                            const meta = mentionMeta[item.type];
                            const Icon = meta.icon;
                            return (
                                <span
                                    key={`${item.type}-${item.id}`}
                                    className={cn(
                                        "inline-flex max-w-[130px] items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em]",
                                        meta.className
                                    )}
                                >
                                    <Icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{item.label || meta.label}</span>
                                </span>
                            );
                        })}
                        {hiddenMentionCount > 0 && (
                            <span className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                                +{hiddenMentionCount}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-[var(--r-2)] bg-[var(--bg-elev)]/80"
                    onClick={() => onEditJournal(journal.id)}
                    aria-label={`Edit ${journal.title || "note"}`}
                >
                    <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-[var(--r-2)] bg-[var(--bg-elev)]/80 text-muted-foreground hover:text-[var(--rose)]"
                    onClick={() => deleteJournal(journal.id)}
                    disabled={isDeleting}
                    loading={isDeleting}
                    hideContentWhenLoading
                    aria-label={`Delete ${journal.title || "note"}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </article>
    );
};
