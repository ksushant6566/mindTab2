import { useCallback } from "react";
import { View, RefreshControl, StyleSheet } from "react-native";
import { MasonryFlashList } from "@shopify/flash-list";
import { SaveCard } from "./save-card";
import { colors } from "~/styles/colors";

export type RawSave = {
  id: string;
  source_type: "article" | "image" | "youtube" | "audio";
  source_title?: string | null;
  source_url?: string | null;
  source_thumbnail_url?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  source_media_url?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  media_file_bytes?: number | null;
  duration_seconds?: number | null;
  processing_status: string;
  commit_status?: string | null;
  created_at: string;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
};

type SaveGridProps = {
  saves: RawSave[];
  onSavePress: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLoadMore: () => void;
};

export function SaveGrid({
  saves,
  onSavePress,
  onRefresh,
  refreshing,
  onLoadMore,
}: SaveGridProps) {
  const renderItem = useCallback(
    ({ item }: { item: RawSave }) => (
      <View style={styles.cell}>
        <SaveCard
          id={item.id}
          sourceType={item.source_type}
          sourceTitle={item.source_title}
          sourceUrl={item.source_url}
          sourceThumbnailUrl={item.source_thumbnail_url}
          summary={item.summary}
          tags={item.tags}
          sourceMediaUrl={item.source_media_url}
          processingStatus={item.processing_status}
          onPress={onSavePress}
          videoDuration={item.duration_seconds ?? undefined}
          videoThumbnailUrl={item.video_thumbnail_url ?? undefined}
          videoChannel={item.video_channel ?? undefined}
        />
      </View>
    ),
    [onSavePress],
  );

  return (
    <MasonryFlashList
      data={saves}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      numColumns={2}
      estimatedItemSize={180}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.text.secondary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  cell: {
    paddingHorizontal: 5,
    paddingBottom: 10,
  },
});
