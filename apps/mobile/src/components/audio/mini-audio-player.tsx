import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pause, Play, X } from "lucide-react-native";
import { useMiniPlayerStore } from "~/stores/mini-player-store";
import { colors } from "~/styles/colors";

export function MiniAudioPlayer() {
  const { contentId, title, playing, toggle, stop } = useMiniPlayerStore();
  const insets = useSafeAreaInsets();

  if (!contentId) return null;

  return (
    <View style={[styles.root, { bottom: insets.bottom + 80 }]}>
      <Pressable onPress={toggle} hitSlop={8} style={styles.icon}>
        {playing ? (
          <Pause size={18} color={colors.bg.primary} fill={colors.bg.primary} />
        ) : (
          <Play size={18} color={colors.bg.primary} fill={colors.bg.primary} />
        )}
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={stop} hitSlop={8}>
        <X size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.bg.elevated,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 12,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "500",
  },
});
