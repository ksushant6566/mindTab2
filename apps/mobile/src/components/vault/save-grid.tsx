import { ScrollView, View, RefreshControl, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { SaveCard, type SaveCardProps } from "./save-card";
import { colors } from "~/styles/colors";

type SaveGridProps = {
  saves: SaveCardProps[];
  onSavePress: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLoadMore: () => void;
};

export function SaveGrid({ saves, onSavePress, onRefresh, refreshing, onLoadMore }: SaveGridProps) {
  const leftColumn = saves.filter((_, i) => i % 2 === 0);
  const rightColumn = saves.filter((_, i) => i % 2 !== 0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
    if (isNearBottom) {
      onLoadMore();
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.text.secondary}
        />
      }
    >
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 12 }}>
        <View style={{ flex: 1 }}>
          {leftColumn.map((save) => (
            <SaveCard key={save.id} {...save} onPress={onSavePress} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          {rightColumn.map((save) => (
            <SaveCard key={save.id} {...save} onPress={onSavePress} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
