import { useState, useCallback } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { FilterChips } from "~/components/vault/filter-chips";
import { SaveGrid, type RawSave } from "~/components/vault/save-grid";
import { SaveFAB } from "~/components/vault/save-fab";
import { colors } from "~/styles/colors";

type FilterType = "all" | "article" | "image" | "youtube" | "instagram_reel" | "audio";

const PAGE_SIZE = 20;

export default function VaultTab() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["saves", "list"],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await api.GET("/saves" as any, {
        params: { query: { limit: PAGE_SIZE, offset: pageParam } },
      });
      return {
        saves: (res.data as RawSave[]) ?? [],
        offset: pageParam as number,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.saves || lastPage.saves.length < PAGE_SIZE) return undefined;
      return lastPage.offset + PAGE_SIZE;
    },
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      const allSaves = pages.flatMap((p) => p.saves ?? []);
      const hasProcessing = allSaves.some(
        (s) =>
          s.processing_status !== "completed" &&
          s.processing_status !== "failed",
      );
      return hasProcessing ? 3000 : false;
    },
  });

  const pages = data?.pages ?? [];
  const allSaves = pages.flatMap((p) => p.saves ?? []);

  const filteredSaves = allSaves.filter(
    (s) => filter === "all" || s.source_type === filter,
  );

  const handleSavePress = useCallback(
    (id: string) => router.push(`/(main)/vault/${id}` as any),
    [router],
  );

  const handleRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    await refetch();
    setIsManualRefresh(false);
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
        saves={filteredSaves}
        onSavePress={handleSavePress}
        onRefresh={handleRefresh}
        refreshing={isManualRefresh}
        onLoadMore={handleLoadMore}
      />
      <SaveFAB />
    </View>
  );
}
