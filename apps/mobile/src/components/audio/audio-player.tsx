import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play } from "lucide-react-native";
import { colors } from "~/styles/colors";

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ source }: { source: string }) {
  const player = useAudioPlayer({ uri: source });
  const status = useAudioPlayerStatus(player);

  const duration = status?.duration ?? 0;
  const position = status?.currentTime ?? 0;
  const isPlaying = status?.playing ?? false;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.btn}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        hitSlop={8}
      >
        {isPlaying ? (
          <Pause size={20} color={colors.bg.primary} fill={colors.bg.primary} />
        ) : (
          <Play size={20} color={colors.bg.primary} fill={colors.bg.primary} />
        )}
      </Pressable>

      <View style={styles.scrubRow}>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`,
              },
            ]}
          />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  scrubRow: { flex: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.subtle,
    overflow: "hidden",
  },
  fill: { height: 4, backgroundColor: colors.accent.indigo },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  time: {
    fontSize: 12,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"],
  },
});
