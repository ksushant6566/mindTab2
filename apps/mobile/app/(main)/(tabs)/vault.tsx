import { useState, useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAccessToken } from "~/lib/auth";
import { api } from "~/lib/api-client";
import { FilterChips } from "~/components/vault/filter-chips";
import { SaveGrid } from "~/components/vault/save-grid";
import { type SaveCardProps } from "~/components/vault/save-card";
import { SaveFAB } from "~/components/vault/save-fab";
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

const PAGE_SIZE = 20;

export default function VaultTab() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["saves"],
    queryFn: async ({ pageParam = 0 }) => {
      const [res, token] = await Promise.all([
        api.GET("/saves" as any, {
          params: { query: { limit: PAGE_SIZE, offset: pageParam } },
        }),
        getAccessToken(),
      ]);
      return {
        saves: (res.data as RawSave[]) ?? [],
        accessToken: token,
        offset: pageParam as number,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.saves.length < PAGE_SIZE) return undefined;
      return lastPage.offset + PAGE_SIZE;
    },
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      const allSaves = pages.flatMap((p) => p.saves);
      const hasProcessing = allSaves.some(
        (s) =>
          s.processing_status !== "completed" &&
          s.processing_status !== "failed",
      );
      return hasProcessing ? 3000 : false;
    },
  });

  const pages = data?.pages ?? [];
  const latestToken = pages.length > 0 ? pages[pages.length - 1].accessToken : null;
  const allSaves = pages.flatMap((p) => p.saves);

  const filteredSaves = allSaves.filter(
    (s) => filter === "all" || s.source_type === filter,
  );

  const cardProps: SaveCardProps[] = filteredSaves.map((s) => ({
    id: s.id,
    sourceType: s.source_type,
    sourceTitle: s.source_title,
    sourceUrl: s.source_url,
    sourceThumbnailUrl: s.source_thumbnail_url,
    summary: s.summary,
    tags: s.tags,
    mediaKey: s.media_key,
    processingStatus: s.processing_status,
    accessToken: latestToken,
    onPress: () => {},
  }));

  const handleSavePress = useCallback(
    (id: string) => router.push(`/(main)/vault/${id}` as any),
    [router],
  );

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFilterChange = useCallback((newFilter: FilterType) => {
    setFilter(newFilter);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <FilterChips activeFilter={filter} onFilterChange={handleFilterChange} />
      <SaveGrid
        saves={cardProps}
        onSavePress={handleSavePress}
        onRefresh={handleRefresh}
        refreshing={isRefetching && !isFetchingNextPage}
        onLoadMore={handleLoadMore}
      />
      <SaveFAB />
    </View>
  );
}
