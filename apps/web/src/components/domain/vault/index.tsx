import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import {
  AudioLinesIcon,
  BookOpenIcon,
  CalendarIcon,
  ChevronDownIcon,
  DatabaseIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FileVideoIcon,
  ImageIcon,
  InfoIcon,
  InstagramIcon,
  LandmarkIcon,
  Link2Icon,
  ListFilterIcon,
  Loader2Icon,
  Mic2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  UploadCloudIcon,
  YoutubeIcon,
} from "lucide-react";
import { MessageResponse } from "~/components/ai-elements/message";
import { Inline, Stack, Surface } from "~/components/layout";
import { EmptyState, MetaChip, SkeletonBlock } from "~/components/patterns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button, buttonVariants } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import type { SaveDetail, SaveListItem } from "~/api/hooks";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const VAULT_FILTERS = [
  "all",
  "article",
  "image",
  "youtube",
  "instagram_reel",
  "x_post",
  "reddit_post",
  "audio",
] as const;

export type VaultFilter = (typeof VAULT_FILTERS)[number];
export type VaultCreatePayload =
  | { kind: "url"; url: string }
  | { kind: "file"; file: File; field: "image" | "audio" | "video" };

export function VaultShell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <Surface variant="transparent" className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none">
      {header}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">{children}</div>
    </Surface>
  );
}

export function VaultToolbar({
  total,
  visible,
  filter,
  search,
  refreshing,
  onFilterChange,
  onSearchChange,
  onRefresh,
  onCreate,
}: {
  total: number;
  visible: number;
  filter: VaultFilter;
  search: string;
  refreshing?: boolean;
  onFilterChange: (filter: VaultFilter) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: (payload: VaultCreatePayload) => Promise<void>;
}) {
  const countLabel = visible === total
    ? `${total} ${total === 1 ? "item" : "items"} loaded`
    : `${visible} of ${total} loaded items`;

  return (
    <div className="shrink-0 pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <MetaText as="p">{countLabel}</MetaText>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search saved items"
              aria-label="Search saved items"
              className="pl-9"
            />
          </div>
          <Inline gap="xs" className="justify-end">
            <VaultFilterMenu value={filter} onValueChange={onFilterChange} />
          <VaultCreateDialog onCreate={onCreate} />
          <VaultToolbarMenu refreshing={refreshing} onRefresh={onRefresh} />
          </Inline>
        </div>
      </div>
    </div>
  );
}

function VaultToolbarMenu({
  refreshing,
  onRefresh,
}: {
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Vault options">
          <EllipsisIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem disabled={refreshing} onSelect={onRefresh}>
          <RefreshCwIcon className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh vault"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VaultFilterMenu({
  value,
  onValueChange,
}: {
  value: VaultFilter;
  onValueChange: (value: VaultFilter) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <ListFilterIcon className="h-4 w-4" />
          {sourceLabel(value)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Content type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (VAULT_FILTERS.includes(nextValue as VaultFilter)) {
              onValueChange(nextValue as VaultFilter);
            }
          }}
        >
          {VAULT_FILTERS.map((item) => (
            <DropdownMenuRadioItem key={item} value={item}>
              {sourceLabel(item)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VaultGrid({ saves }: { saves: SaveListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {saves.map((save) => (
        <Link key={save.id} to="/vault/$saveId" params={{ saveId: save.id }} className="block min-w-0">
          <VaultItemCard save={save} />
        </Link>
      ))}
    </div>
  );
}

export function VaultLoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-48" />
      ))}
    </div>
  );
}

export function VaultNoResults({
  hasSearch,
  canLoadMore,
  loading,
  onLoadMore,
}: {
  hasSearch: boolean;
  canLoadMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
}) {
  const title = hasSearch
    ? canLoadMore ? "No loaded items match" : "No saved items match"
    : "Your vault is ready";
  const description = hasSearch
    ? canLoadMore
      ? "Adjust the search or content type, or load more of your vault."
      : "Try another search or content type."
    : "Save a link, image, recording, or video to build a searchable library of useful context.";

  return (
    <EmptyState
      className="h-full min-h-[360px]"
      icon={<LandmarkIcon className="h-6 w-6" />}
      title={title}
      description={description}
      action={canLoadMore && onLoadMore ? (
        <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading} loading={loading}>
          Load more items
        </Button>
      ) : undefined}
    />
  );
}

export function VaultLoadMore({
  loading,
  onClick,
}: {
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center pt-5">
      <Button type="button" variant="outline" onClick={onClick} disabled={loading} loading={loading}>
        Load more
      </Button>
    </div>
  );
}

export function VaultItemCard({ save, className, ...props }: DivProps & { save: SaveListItem }) {
  const mediaUrl = save.source_thumbnail_url || save.video_thumbnail_url || (
    save.source_type === "image" ? save.media_url : null
  );
  const title = save.source_title || save.source_url || fallbackTitle(save.source_type);

  return (
    <Surface
      variant="base"
      interactive
      className={cn("group h-full min-w-0 overflow-hidden p-0", className)}
      {...props}
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden border-b border-border bg-secondary">
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <SourceIcon sourceType={save.source_type} className="h-7 w-7 text-muted-foreground" />
        )}
        {save.processing_status !== "completed" ? (
          <div className="absolute left-2 top-2">
            <VaultStatusBadge status={save.processing_status} />
          </div>
        ) : null}
        {save.duration_seconds ? (
          <MetaChip className="absolute bottom-2 right-2 bg-background/90">
            {formatDuration(save.duration_seconds)}
          </MetaChip>
        ) : null}
      </div>
      <Stack gap="sm" className="p-4">
        <Stack gap="xs">
          <Heading as="h2" variant="panel" className="line-clamp-2">{title}</Heading>
          {save.summary ? <Text variant="muted" className="line-clamp-2">{save.summary}</Text> : (
            <MetaText>{processingCopy(save.processing_status)}</MetaText>
          )}
        </Stack>
        <Inline className="justify-between" gap="sm">
          <Inline gap="xs" className="min-w-0">
            <MetaChip>{sourceLabel(save.source_type)}</MetaChip>
            {save.tags.slice(0, 1).map((tag) => <MetaChip key={tag}>{tag}</MetaChip>)}
            {save.tags.length > 1 ? <MetaChip>+{save.tags.length - 1}</MetaChip> : null}
          </Inline>
          <MetaText className="shrink-0">
            {formatDistanceToNow(new Date(save.created_at), { addSuffix: true })}
          </MetaText>
        </Inline>
      </Stack>
    </Surface>
  );
}

export function VaultCreateDialog({
  onCreate,
}: {
  onCreate: (payload: VaultCreatePayload) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("url");
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setUrl("");
    setFile(null);
    setError(null);
    setTab("url");
  }, []);

  const chooseFile = React.useCallback((nextFile?: File) => {
    if (!nextFile) return;
    if (!fileField(nextFile)) {
      setError("Choose an image, audio recording, or supported video file.");
      return;
    }
    setFile(nextFile);
    setError(null);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (tab === "url") {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      } catch {
        setError("Enter a complete http or https URL.");
        return;
      }
    } else if (!file) {
      setError("Choose a file to save.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (tab === "url") {
        await onCreate({ kind: "url", url: trimmedUrl });
      } else if (file) {
        const field = fileField(file);
        if (!field) throw new Error("Unsupported file type");
        await onCreate({ kind: "file", file, field });
      }
      setOpen(false);
      reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save this item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen && !submitting) reset();
    }}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon className="mr-2 h-4 w-4" />
          Add to vault
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add to your vault</DialogTitle>
            <DialogDescription>
              MindTab will process the source, generate a summary, and make it available to chat and search.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(value) => { setTab(value); setError(null); }} className="mt-5">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url">Link</TabsTrigger>
              <TabsTrigger value="file">File upload</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="mt-4">
              <Stack gap="sm">
                <Label htmlFor="vault-url">Article, post, video, or reel URL</Label>
                <Input
                  id="vault-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/useful-idea"
                  autoComplete="url"
                  disabled={submitting}
                />
                <MetaText>YouTube, Instagram Reels, X posts, Reddit posts, and web articles are recognized automatically.</MetaText>
              </Stack>
            </TabsContent>
            <TabsContent value="file" className="mt-4">
              <input
                id="vault-file"
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,audio/*,video/mp4,video/quicktime,video/webm"
                onChange={(event) => chooseFile(event.target.files?.[0])}
                disabled={submitting}
              />
              <label
                htmlFor="vault-file"
                className={cn(
                  "flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[var(--r-3)] border border-dashed p-6 text-center transition-colors",
                  dragging ? "border-primary bg-primary/10" : "border-border bg-secondary/40 hover:border-[var(--border-2)] hover:bg-secondary",
                )}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  chooseFile(event.dataTransfer.files?.[0]);
                }}
              >
                {file ? (
                  <>
                    <SourceIcon sourceType={fileField(file) || "file"} className="mb-3 h-8 w-8 text-[var(--ink)]" />
                    <Heading variant="panel" className="max-w-full truncate">{file.name}</Heading>
                    <MetaText className="mt-1">{formatFileSize(file.size)} · Click to replace</MetaText>
                  </>
                ) : (
                  <>
                    <UploadCloudIcon className="mb-3 h-8 w-8 text-muted-foreground" />
                    <Heading variant="panel">Drop a file here, or choose one</Heading>
                    <MetaText className="mt-1">Images, audio, MP4, MOV, or WebM</MetaText>
                  </>
                )}
              </label>
            </TabsContent>
          </Tabs>
          {error ? <Text variant="danger" className="mt-3">{error}</Text> : null}
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={submitting || (tab === "url" ? !url.trim() : !file)}>
              {submitting ? "Adding…" : "Add to vault"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VaultDetailView({
  save,
  deleting,
  onDelete,
}: {
  save: SaveDetail;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const extractedLabel = save.source_type === "audio" || save.source_type === "youtube"
    ? "Transcript"
    : save.source_type === "x_post" || save.source_type === "reddit_post"
      ? "Post content"
      : "Extracted content";
  const extractedContent = save.extracted_text ? cleanExtractedContent(save.extracted_text) : null;

  return (
    <Surface variant="transparent" className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-none">
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="flex min-h-9 items-center justify-between gap-3">
            <Inline gap="xs" className="min-w-0 flex-wrap">
              <MetaChip icon={<SourceIcon sourceType={save.source_type} className="h-3 w-3" />}>
                {sourceLabel(save.source_type)}
              </MetaChip>
              {save.processing_status !== "completed" ? <VaultStatusBadge status={save.processing_status} /> : null}
              {save.video_channel ? <MetaChip>{save.video_channel}</MetaChip> : null}
            </Inline>
            <VaultDetailActions
              sourceUrl={save.source_url}
              deleting={deleting}
              onDelete={onDelete}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Stack gap="lg">
              <VaultPrimaryMedia save={save} />
              <VaultProcessingState save={save} />
              {save.summary ? (
                <VaultDetailSection title="Summary" icon={<BookOpenIcon className="h-4 w-4" />}>
                  <MessageResponse>{save.summary}</MessageResponse>
                </VaultDetailSection>
              ) : save.processing_status === "completed" ? (
                <VaultDetailSection title="Summary" icon={<BookOpenIcon className="h-4 w-4" />}>
                  <Text variant="muted">No summary is available for this item.</Text>
                </VaultDetailSection>
              ) : null}
              {extractedContent ? (
                <VaultDetailDisclosure
                  title={extractedLabel}
                  description={contentLengthLabel(extractedContent)}
                  icon={save.source_type === "audio" ? <Mic2Icon className="h-4 w-4" /> : <FileTextIcon className="h-4 w-4" />}
                >
                  <MessageResponse>{extractedContent}</MessageResponse>
                </VaultDetailDisclosure>
              ) : null}
              {save.visual_description ? (
                <VaultDetailDisclosure
                  title="Visual description"
                  description="AI-generated description of the saved visual"
                  icon={<ImageIcon className="h-4 w-4" />}
                >
                  <MessageResponse>{save.visual_description}</MessageResponse>
                </VaultDetailDisclosure>
              ) : null}
            </Stack>
            <Stack gap="md">
              <VaultAboutSection save={save} />
              <VaultProcessingDetails save={save} />
            </Stack>
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function VaultDetailLoading() {
  return (
    <Surface variant="transparent" className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-none pr-2">
      <Stack gap="md">
        <SkeletonBlock className="h-9 w-48" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Stack gap="lg"><SkeletonBlock className="h-72" /><SkeletonBlock className="h-40" /></Stack>
          <Stack gap="md"><SkeletonBlock className="h-52" /><SkeletonBlock className="h-28" /></Stack>
        </div>
      </Stack>
    </Surface>
  );
}

function VaultDetailActions({
  sourceUrl,
  deleting,
  onDelete,
}: {
  sourceUrl?: string | null;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Saved item options">
            <EllipsisIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {sourceUrl ? (
            <DropdownMenuItem asChild>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Open original
              </a>
            </DropdownMenuItem>
          ) : null}
          {sourceUrl ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            Delete saved item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved item?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your vault and will no longer be available to search or chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep item</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete item"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VaultAboutSection({ save }: { save: SaveDetail }) {
  const hasOrganization = save.tags.length > 0 || save.key_topics.length > 0;
  const source = save.source_url ? (
    <a
      href={save.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-primary"
    >
      {extractDomain(save.source_url)}
      <ExternalLinkIcon className="h-3 w-3" />
    </a>
  ) : sourceLabel(save.source_type);

  return (
    <VaultDetailSection title="About this save">
      <Stack gap="md">
        <VaultFact icon={<CalendarIcon className="h-4 w-4" />} label="Saved" value={format(new Date(save.created_at), "MMM d, yyyy 'at' h:mm a")} />
        <VaultFact icon={<Link2Icon className="h-4 w-4" />} label="Source" value={source} />
        {save.duration_seconds ? <VaultFact icon={<AudioLinesIcon className="h-4 w-4" />} label="Duration" value={formatDuration(save.duration_seconds)} /> : null}
        {save.transcript_source ? <VaultFact icon={<Mic2Icon className="h-4 w-4" />} label="Transcript" value={transcriptSourceLabel(save.transcript_source)} /> : null}
        {hasOrganization ? <Separator /> : null}
        {save.tags.length > 0 ? (
          <Stack gap="xs">
            <Inline gap="xs" className="text-muted-foreground">
              <TagIcon className="h-3.5 w-3.5" />
              <MetaText>Tags</MetaText>
            </Inline>
            <Inline gap="xs" className="flex-wrap">
              {save.tags.map((tag) => <MetaChip key={tag}>{tag}</MetaChip>)}
            </Inline>
          </Stack>
        ) : null}
        {save.key_topics.length > 0 ? (
          <Stack gap="xs">
            <MetaText>Key topics</MetaText>
            <Inline gap="xs" className="flex-wrap">
              {save.key_topics.map((topic) => <MetaChip key={topic}>{topic}</MetaChip>)}
            </Inline>
          </Stack>
        ) : null}
      </Stack>
    </VaultDetailSection>
  );
}

function VaultProcessingDetails({ save }: { save: SaveDetail }) {
  const sourceMetadata = save.source_metadata ?? {};

  return (
    <VaultDetailDisclosure
      title="Processing details"
      description="Status and source metadata"
      icon={<InfoIcon className="h-4 w-4" />}
    >
      <Stack gap="md">
        <VaultFact icon={<RefreshCwIcon className="h-4 w-4" />} label="Processing" value={sourceLabel(save.processing_status)} />
        <VaultFact icon={<CalendarIcon className="h-4 w-4" />} label="Updated" value={format(new Date(save.updated_at), "MMM d, yyyy 'at' h:mm a")} />
        {save.summary_provider ? <VaultFact icon={<BookOpenIcon className="h-4 w-4" />} label="Summary provider" value={save.summary_provider} /> : null}
        {save.embedding_provider || save.embedding_model ? (
          <VaultFact
            icon={<DatabaseIcon className="h-4 w-4" />}
            label="Search index"
            value={[save.embedding_provider, save.embedding_model].filter(Boolean).join(" · ")}
          />
        ) : null}
        {Object.entries(sourceMetadata).map(([key, value]) => {
          const formattedValue = formatMetadataValue(value);
          return formattedValue ? (
            <VaultFact
              key={key}
              icon={<InfoIcon className="h-4 w-4" />}
              label={humanizeMetadataKey(key)}
              value={formattedValue}
            />
          ) : null;
        })}
      </Stack>
    </VaultDetailDisclosure>
  );
}

export function VaultDetailSection({
  title,
  icon,
  children,
  className,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="base" className={cn("overflow-hidden p-4", className)}>
      <Stack gap="md">
        <Inline gap="xs" className="text-muted-foreground">
          {icon}
          <Heading variant="section">{title}</Heading>
        </Inline>
        {children}
      </Stack>
    </Surface>
  );
}

export function VaultDetailDisclosure({
  title,
  description,
  icon,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible className="group">
      <Surface variant="base" className="overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-[var(--bg-hover)]">
          <Inline gap="sm" className="min-w-0 text-muted-foreground">
            {icon}
            <Stack gap="xs" className="min-w-0">
              <Heading variant="section" className="text-foreground">{title}</Heading>
              {description ? <MetaText className="truncate">{description}</MetaText> : null}
            </Stack>
          </Inline>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
        </CollapsibleContent>
      </Surface>
    </Collapsible>
  );
}

export function VaultMediaPreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Surface variant="soft" className={cn("flex min-h-48 items-center justify-center overflow-hidden p-3", className)}>
      {children}
    </Surface>
  );
}

export function VaultStatusBadge({ status }: { status: string }) {
  const tone = status === "completed"
    ? "border-[var(--tone-status-done)]/30 bg-[var(--tone-status-done)]/10 text-[var(--tone-status-done)]"
    : status === "failed"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-[var(--tone-status-progress)]/30 bg-[var(--tone-status-progress)]/10 text-[var(--tone-status-progress)]";
  return <MetaChip className={tone}>{sourceLabel(status)}</MetaChip>;
}

function VaultPrimaryMedia({ save }: { save: SaveDetail }) {
  const poster = save.video_thumbnail_url || save.source_thumbnail_url || undefined;
  if (save.source_type === "audio" && save.media_url) {
    return (
      <VaultMediaPreview className="min-h-36 bg-gradient-to-br from-secondary to-card">
        <div className="w-full max-w-xl px-4 py-6 text-center">
          <AudioLinesIcon className="mx-auto mb-4 h-9 w-9 text-[var(--ink)]" />
          <audio src={save.media_url} controls preload="metadata" className="w-full" />
        </div>
      </VaultMediaPreview>
    );
  }
  if (save.source_type === "image" && save.media_url) {
    return <VaultMediaPreview><img src={save.media_url} alt={save.source_title || "Saved image"} className="max-h-[560px] w-full object-contain" /></VaultMediaPreview>;
  }
  if (save.media_url && isVideoMedia(save)) {
    return (
      <VaultMediaPreview className="p-0">
        <video src={save.media_url} poster={poster} controls preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />
      </VaultMediaPreview>
    );
  }
  if (poster) {
    return <VaultMediaPreview className="p-0"><img src={poster} alt="" className="max-h-[480px] w-full object-cover" /></VaultMediaPreview>;
  }
  return null;
}

function VaultProcessingState({ save }: { save: SaveDetail }) {
  if (save.processing_status === "completed") return null;
  const progress = save.processing_status === "deferred" ? 10 : save.processing_status === "pending" ? 30 : save.processing_status === "processing" ? 68 : 100;
  const failed = save.processing_status === "failed";
  return (
    <Surface variant="soft" className={cn("p-4", failed && "border-destructive/40 bg-destructive/10")}>
      <Stack gap="sm">
        <Inline gap="sm">
          {failed ? <FileTextIcon className="h-4 w-4 text-destructive" /> : <Loader2Icon className="h-4 w-4 animate-spin text-[var(--tone-status-progress)]" />}
          <Stack gap="xs">
            <Heading variant="panel">{failed ? "Processing failed" : processingCopy(save.processing_status)}</Heading>
            <MetaText>{failed ? save.processing_error || "MindTab could not process this source." : "This page updates automatically as richer details become available."}</MetaText>
          </Stack>
        </Inline>
        <Progress value={progress} className={cn(failed && "[&>div]:bg-destructive")} />
      </Stack>
    </Surface>
  );
}

function VaultFact({ icon, label, value }: { icon: React.ReactNode; label: React.ReactNode; value: React.ReactNode }) {
  return (
    <Inline align="start" gap="sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <Stack gap="xs">
        <MetaText>{label}</MetaText>
        <Text>{value}</Text>
      </Stack>
    </Inline>
  );
}

function SourceIcon({ sourceType, className }: { sourceType: string; className?: string }) {
  const Icon = sourceType === "image" || sourceType === "file"
    ? ImageIcon
    : sourceType === "youtube"
      ? YoutubeIcon
      : sourceType === "instagram_reel"
        ? InstagramIcon
        : sourceType === "audio"
          ? AudioLinesIcon
          : sourceType === "video"
            ? FileVideoIcon
            : FileTextIcon;
  return <Icon className={className} />;
}

export function sourceLabel(value?: string | null) {
  const labels: Record<string, string> = {
    all: "All",
    article: "Articles",
    audio: "Audio",
    completed: "Ready",
    deferred: "Waiting",
    failed: "Failed",
    image: "Images",
    instagram_reel: "Reels",
    pending: "Queued",
    processing: "Processing",
    reddit_post: "Reddit",
    website: "Article",
    x_post: "X posts",
    youtube: "YouTube",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Saved item";
}

function fallbackTitle(sourceType: string) {
  if (sourceType === "audio") return "Voice note";
  if (sourceType === "image") return "Saved image";
  return `Saved ${sourceLabel(sourceType).toLowerCase()}`;
}

function processingCopy(status: string) {
  if (status === "deferred") return "Waiting to process";
  if (status === "pending") return "Queued for processing";
  if (status === "processing") return "Extracting details and preparing your summary";
  if (status === "failed") return "Processing failed";
  return "Ready in your vault";
}

function fileField(file: File): "image" | "audio" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 ** 2) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_024 ** 2).toFixed(1)} MB`;
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function transcriptSourceLabel(source: string) {
  if (source === "whisper") return "Whisper transcription";
  if (source === "captions") return "Source captions";
  return sourceLabel(source);
}

function cleanExtractedContent(raw: string) {
  const marker = "Markdown Content:";
  const withoutPreamble = raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length) : raw;
  return withoutPreamble.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
}

function contentLengthLabel(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return `${words.toLocaleString()} ${words === 1 ? "word" : "words"} · Expand to read`;
}

function humanizeMetadataKey(key: string) {
  const label = key.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Source detail";
}

function formatMetadataValue(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    return value.map(String).join(", ");
  }
  return null;
}

function isVideoMedia(save: SaveDetail) {
  return save.source_type === "instagram_reel" || /\.(mp4|mov|webm)(?:\?|$)/i.test(save.media_url || "");
}

export const VaultIcons = { FileTextIcon, ImageIcon, Link2Icon };
