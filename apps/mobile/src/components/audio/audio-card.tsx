import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Play } from "lucide-react-native";
import { useMiniPlayerStore } from "~/stores/mini-player-store";
import { colors } from "~/styles/colors";

function fmtDuration(sec: number | null | undefined) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  id: string;
  title: string;
  durationSeconds: number | null;
  preview: string | null;
  mediaUrl: string | null;
  onPress: () => void;
};

export function AudioCard({
  id,
  title,
  durationSeconds,
  preview,
  mediaUrl,
  onPress,
}: Props) {
  const play = useMiniPlayerStore((s) => s.play);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <Pressable
          hitSlop={8}
          style={styles.playBtn}
          onPress={() =>
            mediaUrl && play({ contentId: id, title, uri: mediaUrl })
          }
        >
          <Play size={18} color={colors.bg.primary} fill={colors.bg.primary} />
        </Pressable>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.duration}>{fmtDuration(durationSeconds)}</Text>
          {preview ? (
            <Text style={styles.preview} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    gap: 10,
  },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 14, color: colors.text.primary, fontWeight: "500" },
  duration: {
    fontSize: 12,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"],
  },
  preview: { fontSize: 13, color: colors.text.secondary, marginTop: 4 },
});
