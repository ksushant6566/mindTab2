import { useCallback } from "react";
import { FlatList, View, RefreshControl, StyleSheet } from "react-native";
import { SaveCard } from "./save-card";
import { colors } from "~/styles/colors";

export type RawSave = {
  id: string;
  source_type: "article" | "image" | "youtube";
  source_title?: string | null;
  source_url?: string | null;
  source_thumbnail_url?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  media_key?: string | null;
  processing_status: string;
  created_at: string;
  video_duration?: number | null;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
};

type SaveGridProps = {
  saves: RawSave[];
  accessToken?: string | null;
  onSavePress: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLoadMore: () => void;
};

const keyExtractor = (item: RawSave) => item.id;

export function SaveGrid({
  saves,
  accessToken,
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
          mediaKey={item.media_key}
          processingStatus={item.processing_status}
          accessToken={accessToken}
          onPress={onSavePress}
          videoDuration={item.video_duration ?? undefined}
          videoThumbnailUrl={item.video_thumbnail_url ?? undefined}
          videoChannel={item.video_channel ?? undefined}
        />
      </View>
    ),
    [accessToken, onSavePress],
  );

  return (
    <FlatList
      data={saves}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      removeClippedSubviews
      maxToRenderPerBatch={6}
      initialNumToRender={10}
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
  row: {
    gap: 10,
  },
  cell: {
    flex: 1,
    maxWidth: "50%",
    marginBottom: 10,
  },
});
