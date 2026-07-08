import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, FileText, Image, Trash2, Video } from "lucide-react";
import { api } from "~/api/client";
import { savesQueryOptions, saveQueryOptions } from "~/api/hooks";
import { VaultDetailSection, VaultFilterTabs, VaultItemCard, VaultMediaPreview } from "~/components/domain/vault";
import { EmptyState, MetaChip, SkeletonBlock } from "~/components/patterns";
import { Button } from "~/components/ui/button";
import { Heading, MetaText, Text } from "~/components/ui/typography";

type SaveRecord = {
    id: string;
    source_type?: string | null;
    source_title?: string | null;
    source_url?: string | null;
    source_thumbnail_url?: string | null;
    video_thumbnail_url?: string | null;
    video_channel?: string | null;
    media_url?: string | null;
    summary?: string | null;
    tags?: string[] | null;
    processing_status?: string | null;
    processing_error?: string | null;
    created_at?: string | null;
    extracted_text?: string | null;
    visual_description?: string | null;
};

const FILTERS = ["all", "article", "image", "youtube", "instagram_reel", "x_post", "reddit_post", "audio"] as const;

function sourceLabel(sourceType?: string | null) {
    return (sourceType || "save").replaceAll("_", " ");
}

function sourceIcon(sourceType?: string | null) {
    if (sourceType === "image") return <Image className="h-4 w-4" />;
    if (sourceType === "youtube" || sourceType === "instagram_reel") return <Video className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
}

export function WebVaultPage() {
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
    const { data, isLoading } = useQuery(savesQueryOptions({ limit: 100, offset: 0 }));
    const saves = ((data as SaveRecord[]) ?? []);
    const filteredSaves = useMemo(
        () => saves.filter((save) => filter === "all" || save.source_type === filter),
        [filter, saves]
    );

    return (
        <div className="flex h-full min-h-0 w-full flex-col rounded-[var(--r-3)] border border-border bg-card/70">
            <div className="border-b border-border px-5 py-4">
                <Heading as="h1" variant="page">Vault</Heading>
                <MetaText as="p" className="mt-1">{saves.length} saved items</MetaText>
                <VaultFilterTabs
                    value={filter}
                    options={FILTERS.map((item) => ({ value: item, label: sourceLabel(item) }))}
                    onValueChange={setFilter}
                    className="mt-4 flex-wrap"
                />
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <SkeletonBlock key={index} className="h-36" />
                        ))}
                    </div>
                ) : filteredSaves.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {filteredSaves.map((save) => (
                            <Link
                                key={save.id}
                                to="/vault/$saveId"
                                params={{ saveId: save.id }}
                                className="block"
                            >
                                <VaultItemCard
                                    title={save.source_title || save.source_url || "Untitled save"}
                                    summary={save.summary}
                                    sourceType={sourceLabel(save.source_type)}
                                    state={save.processing_status}
                                    media={
                                      save.source_thumbnail_url || save.video_thumbnail_url || save.media_url ? (
                                        <img
                                            src={save.source_thumbnail_url || save.video_thumbnail_url || save.media_url || ""}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                      ) : (
                                        sourceIcon(save.source_type)
                                      )
                                    }
                                    actions={save.created_at ? <MetaText>{format(new Date(save.created_at), "MMM d, yyyy")}</MetaText> : null}
                                />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        className="h-full min-h-[320px]"
                        title="No saved items"
                        description="Your saved articles, media, and notes will appear here."
                    />
                )}
            </div>
        </div>
    );
}

export function WebVaultDetailPage({ saveId }: { saveId: string }) {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery(saveQueryOptions(saveId));
    const save = data as SaveRecord | undefined;
    const deleteMutation = useMutation({
        mutationFn: async () => {
            const { error } = await api.DELETE("/saves/{id}", {
                params: { path: { id: saveId } },
            });
            if (error) throw error;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["saves"] });
            window.history.pushState(null, "", "/vault");
            window.dispatchEvent(new PopStateEvent("popstate"));
        },
    });

    return (
        <div className="flex h-full min-h-0 w-full max-w-5xl flex-col rounded-[var(--r-3)] border border-border bg-card/70">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                    <Link to="/vault" className="mb-3 inline-flex items-center gap-2 text-[length:var(--type-body-size)] text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                        Vault
                    </Link>
                    <Heading as="h1" variant="page" className="line-clamp-2">
                        {isLoading ? "Loading..." : save?.source_title || save?.source_url || "Untitled save"}
                    </Heading>
                    {save && (
                        <MetaText className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="capitalize">{sourceLabel(save.source_type)}</span>
                            {save.video_channel && <span>{save.video_channel}</span>}
                            {save.processing_status && <span>{save.processing_status}</span>}
                        </MetaText>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {save?.source_url && (
                        <Button variant="outline" size="icon" asChild>
                            <a href={save.source_url} target="_blank" rel="noopener noreferrer" aria-label="Open source">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Delete save"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                            if (confirm("Delete this saved item?")) deleteMutation.mutate();
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                {isLoading || !save ? (
                    <div className="space-y-3">
                        <SkeletonBlock className="h-56" />
                        <SkeletonBlock className="h-28" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {(save.media_url || save.source_thumbnail_url || save.video_thumbnail_url) && (
                            <VaultMediaPreview>
                                <img
                                    src={save.media_url || save.source_thumbnail_url || save.video_thumbnail_url || ""}
                                    alt=""
                                    className="max-h-[420px] w-full object-contain"
                                />
                            </VaultMediaPreview>
                        )}
                        {save.processing_error && (
                            <Text as="div" variant="danger" className="rounded-[var(--r-3)] border border-destructive/30 bg-destructive/10 p-4">
                                {save.processing_error}
                            </Text>
                        )}
                        {save.summary && (
                            <VaultDetailSection title="Summary">
                                <Text as="p" variant="muted" className="mt-3 whitespace-pre-wrap leading-7">{save.summary}</Text>
                            </VaultDetailSection>
                        )}
                        {save.tags && save.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {save.tags.map((tag) => (
                                    <MetaChip key={tag}>{tag}</MetaChip>
                                ))}
                            </div>
                        )}
                        {(save.extracted_text || save.visual_description) && (
                            <VaultDetailSection title={save.extracted_text ? "Extracted text" : "Visual description"}>
                                <Text as="p" variant="muted" className="mt-3 whitespace-pre-wrap leading-7">
                                    {save.extracted_text || save.visual_description}
                                </Text>
                            </VaultDetailSection>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
