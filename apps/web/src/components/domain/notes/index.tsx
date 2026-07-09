import * as React from "react";
import { Clock3, Edit3, FileText, FolderOpen, Hash, MessageSquareText, Target, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DialogContent,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "~/components/ui/select";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Cluster, Inline, Stack, Surface } from "~/components/layout";
import { ActionRail, EmptyState, EntityChip, MetaChip, SkeletonBlock } from "~/components/patterns";
import { Prose, RichTextEditorSurface } from "~/components/patterns/rich-text";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
export type NoteMentionType = "task" | "note";

export type NoteMentionItem = {
  id: string;
  type: NoteMentionType;
  label?: string | null;
};

export type NoteProjectOption = {
  id: string;
  name?: string | null;
  status?: string | null;
};

export function NoteCard({
  title,
  preview,
  metadata,
  selected,
  className,
  ...props
}: DivProps & {
  title: React.ReactNode;
  preview?: React.ReactNode;
  metadata?: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <Surface
      variant="base"
      interactive
      className={cn("group min-w-0 p-3", selected && "border-primary ring-1 ring-primary", className)}
      {...props}
    >
      <Stack gap="sm">
        <Inline align="start" gap="sm">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <Stack gap="xs" className="min-w-0">
            <Heading as="div" variant="panel" className="truncate">{title}</Heading>
            {preview ? <RichTextPreview>{preview}</RichTextPreview> : null}
          </Stack>
        </Inline>
        {metadata ? <NoteMetadata>{metadata}</NoteMetadata> : null}
      </Stack>
    </Surface>
  );
}

export function NoteMetadata({ className, ...props }: DivProps) {
  return <Cluster gap="sm" className={cn("text-muted-foreground", className)} {...props} />;
}

export function MentionChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <MetaChip icon={<MessageSquareText className="h-3 w-3" />} className={className}>{children}</MetaChip>;
}

export function NoteProjectChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <EntityChip icon={<Hash className="h-3 w-3" />} className={className}>{children}</EntityChip>;
}

export function RichTextPreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text as="div" variant="muted" className={cn("prose prose-sm max-w-none line-clamp-3 prose-p:my-0 prose-a:text-primary", className)}>
      {children}
    </Text>
  );
}

export function NoteMetaPill({
  icon,
  tone,
  children,
  className,
}: {
  icon?: React.ReactNode;
  tone?: "task" | "note" | "project" | "muted";
  children: React.ReactNode;
  className?: string;
}) {
  const toneClassName = {
    task: "text-[var(--tone-task)]",
    note: "text-[var(--tone-note)]",
    project: "text-[var(--tone-project)]",
    muted: "text-muted-foreground",
  }[tone ?? "muted"];

  return (
    <span
      className={cn(
        "inline-flex max-w-[170px] items-center gap-1 rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em]",
        toneClassName,
        className
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function NoteMentionPills({
  items,
  limit = 8,
}: {
  items: NoteMentionItem[];
  limit?: number;
}) {
  if (!items.length) return null;

  const visibleItems = items.slice(0, limit);
  const hiddenCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <>
      {visibleItems.map((item) => {
        const isTask = item.type === "task";
        const Icon = isTask ? Target : FileText;
        return (
          <NoteMetaPill
            key={`${item.type}-${item.id}`}
            tone={isTask ? "task" : "note"}
            icon={<Icon className="h-3 w-3 shrink-0" />}
          >
            {item.label || (isTask ? "Task" : "Note")}
          </NoteMetaPill>
        );
      })}
      {hiddenCount > 0 ? <NoteMetaPill>+{hiddenCount}</NoteMetaPill> : null}
    </>
  );
}

export function NotePreviewCard({
  title,
  dateLabel,
  updatedLabel,
  projectName,
  contentHtml,
  wordCount,
  mentions,
  isDeleting,
  onOpen,
  onEdit,
  onDelete,
}: {
  title: string;
  dateLabel: React.ReactNode;
  updatedLabel: React.ReactNode;
  projectName?: string | null;
  contentHtml?: string | null;
  wordCount?: number;
  mentions?: NoteMentionItem[];
  isDeleting?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const visibleMentions = mentions?.slice(0, 3) ?? [];

  return (
    <article
      className={cn(
        "group/card relative min-h-[220px] overflow-hidden rounded-[var(--r-3)] border border-border bg-card p-4 text-card-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--overlay-subtle)]",
        "hover:-translate-y-0.5 hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:shadow-[var(--shadow-card-hover)]"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-[var(--r-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={onOpen}
        aria-label={`Open ${title || "note"}`}
      />

      <div className="pointer-events-none relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>Note</span>
              <span className="text-[var(--text-4)]">·</span>
              <span>{dateLabel}</span>
            </div>
            <Heading as="h3" variant="panel" className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5">
              {title || "Untitled note"}
            </Heading>
          </div>
          {projectName ? (
            <NoteMetaPill tone="project" icon={<FolderOpen className="h-3 w-3 shrink-0" />} className="max-w-[150px] shrink-0">
              {projectName}
            </NoteMetaPill>
          ) : null}
        </div>

        <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
          {contentHtml ? (
            <div className="note-preview" dangerouslySetInnerHTML={{ __html: contentHtml }} />
          ) : (
            <Text variant="muted">No content yet.</Text>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card via-card/90 to-transparent transition-colors group-hover/card:from-[var(--bg-soft)] group-hover/card:via-[var(--bg-soft)]/90" />
        </div>

        <div className="mt-4 flex min-h-7 items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <NoteMetaPill icon={<Clock3 className="h-3 w-3" />}>{updatedLabel}</NoteMetaPill>
            {wordCount && wordCount > 0 ? <NoteMetaPill>{wordCount} words</NoteMetaPill> : null}
            <NoteMentionPills items={visibleMentions} limit={3} />
          </div>
        </div>
      </div>

      <ActionRail className="absolute bottom-3 right-3 z-20 gap-0.5 group-hover/card:opacity-100 group-focus-within/card:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-[var(--r-2)] bg-[var(--bg-elev)]/80"
          onClick={onEdit}
          aria-label={`Edit ${title || "note"}`}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-[var(--r-2)] bg-[var(--bg-elev)]/80 text-muted-foreground hover:text-[var(--tone-danger)]"
          onClick={onDelete}
          disabled={isDeleting}
          loading={isDeleting}
          hideContentWhenLoading
          aria-label={`Delete ${title || "note"}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </ActionRail>
    </article>
  );
}

export function NoteDialogHeaderMeta({
  projectName,
  updatedLabel,
}: {
  projectName?: React.ReactNode;
  updatedLabel: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
      <span>Note</span>
      <span className="text-[var(--text-4)]">·</span>
      <span>{projectName || "No project"}</span>
      <span className="text-[var(--text-4)]">·</span>
      <span>Updated {updatedLabel}</span>
    </span>
  );
}

export function NoteKindMeta() {
  return (
    <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
      <FileText className="h-3 w-3" />
      <span>Note</span>
    </span>
  );
}

export function NoteDialogContentFrame({ children }: { children: React.ReactNode }) {
  return (
    <DialogContent className="max-h-[88vh] max-w-4xl gap-0 overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[var(--shadow-dialog)] sm:rounded-[var(--r-4)]">
      {children}
    </DialogContent>
  );
}

export function NoteDialogBody({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: () => void;
}) {
  return (
    <div
      className="min-h-0 bg-[var(--bg)]/45 px-5 pb-5 pt-4"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
    >
      {children}
    </div>
  );
}

export function NoteModeSwitch({
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

export function NoteProseSurface({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div className={cn("custom-scrollbar max-h-[min(58vh,540px)] min-w-0 overflow-auto rounded-[var(--r-3)] border border-border bg-background", className)}>
      <Prose html={html} />
    </div>
  );
}

export function NoteEditorSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  return <RichTextEditorSurface className={className}>{children}</RichTextEditorSurface>;
}

export function NoteProjectSelectControl({
  value,
  projects,
  onValueChange,
  disabled,
  className,
}: {
  value?: string | null;
  projects?: NoteProjectOption[] | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selectedProject = projects?.find((project) => project.id === value);
  const selectedLabel = selectedProject?.name || "No Project";

  return (
    <Select
      value={value || "none"}
      onValueChange={(nextValue) => onValueChange(nextValue === "none" ? null : nextValue)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "h-8 gap-2 rounded-[var(--r-2)] border-input bg-background px-2 text-[length:var(--type-meta-size)] focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
          "w-[220px]",
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {selectedProject ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--tone-project)]" />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/60" />
          )}
          <span className="truncate">{selectedLabel}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="border-border bg-[var(--bg-elev)] shadow-[var(--shadow-popover)]">
        <SelectGroup>
          <SelectLabel className="py-1 pl-8 pr-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Project
          </SelectLabel>
          <SelectItem
            value="none"
            className="h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-[length:var(--type-meta-size)] text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]"
          >
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/60" />
              No Project
            </span>
          </SelectItem>
          {projects?.map((project) => (
            <SelectItem
              key={project.id}
              value={project.id}
              className="h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-[length:var(--type-meta-size)] text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-[var(--tone-project)]" />
                {project.name || "Unnamed Project"}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function NoteGrid({ className, ...props }: DivProps) {
  return <div className={cn("grid grid-cols-1 gap-3 pb-1 xl:grid-cols-2", className)} {...props} />;
}

export function NoteSkeletonGrid() {
  return (
    <NoteGrid className="pb-0">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-h-[220px] rounded-[var(--r-3)] border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-5 w-48" />
            </div>
            <SkeletonBlock className="h-7 w-24 rounded-[var(--r-2)]" />
          </div>
          <div className="mt-5 space-y-2">
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-11/12" />
            <SkeletonBlock className="h-3 w-4/5" />
            <SkeletonBlock className="h-3 w-3/5" />
          </div>
          <div className="mt-7 flex gap-2">
            <SkeletonBlock className="h-6 w-24 rounded-[var(--r-2)]" />
            <SkeletonBlock className="h-6 w-20 rounded-[var(--r-2)]" />
          </div>
        </div>
      ))}
    </NoteGrid>
  );
}

export function NotesEmptyState({ action }: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={<FileText className="h-5 w-5" />}
      title="No notes yet"
      action={action}
      className="px-4 py-12"
    />
  );
}
