import { useState, useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { FilterChips } from "~/components/vault/filter-chips";
import { SaveGrid } from "~/components/vault/save-grid";
import { type SaveCardProps } from "~/components/vault/save-card";
import { colors } from "~/styles/colors";

type FilterType = "all" | "article" | "image";

type RawSave = {
  id: string;
  source_type: "article" | "image";
  source_title?: string | null;
  source_url?: string | null;
  source_thumbnail_url?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  media_key?: string | null;
  processing_status: string;
  created_at: string;
};

export default function VaultTab() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["saves"],
    queryFn: async () => {
      const { data } = await api.GET("/saves" as any, {
        params: { query: { limit: 100, offset: 0 } },
      });
      return (data as RawSave[]) ?? [];
    },
  });

  const allSaves: RawSave[] = data ?? [];

  const filteredSaves = allSaves.filter(
    (s) => filter === "all" || s.source_type === filter
  );

  const visibleSaves = filteredSaves.slice(0, offset + PAGE_SIZE);

  const cardProps: SaveCardProps[] = visibleSaves.map((s) => ({
    id: s.id,
    sourceType: s.source_type,
    sourceTitle: s.source_title,
    sourceUrl: s.source_url,
    sourceThumbnailUrl: s.source_thumbnail_url,
    summary: s.summary,
    tags: s.tags,
    mediaKey: s.media_key,
    processingStatus: s.processing_status,
    onPress: (id: string) => router.push(`/(main)/vault/${id}` as any),
  }));

  const handleRefresh = useCallback(async () => {
    setOffset(0);
    await refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (offset + PAGE_SIZE < filteredSaves.length) {
      setOffset((prev) => prev + PAGE_SIZE);
    }
  }, [offset, filteredSaves.length]);

  const handleFilterChange = useCallback((newFilter: FilterType) => {
    setFilter(newFilter);
    setOffset(0);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <FilterChips activeFilter={filter} onFilterChange={handleFilterChange} />
      <SaveGrid
        saves={cardProps}
        onSavePress={(id) => router.push(`/(main)/vault/${id}` as any)}
        onRefresh={handleRefresh}
        refreshing={isFetching}
        onLoadMore={handleLoadMore}
      />
    </View>
  );
}
