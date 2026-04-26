import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { Pause, Play, Square } from "lucide-react-native";
import { useRecorderStore } from "~/stores/recorder-store";
import { colors } from "~/styles/colors";

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  onStop: (out: { fileUri: string; durationSeconds: number }) => void;
};

export function AudioRecorder({ onStop }: Props) {
  const status = useRecorderStore((s) => s.status);
  const elapsedMs = useRecorderStore((s) => s.elapsedMs);
  const meter = useRecorderStore((s) => s.meterLevel);
  const start = useRecorderStore((s) => s.start);
  const pause = useRecorderStore((s) => s.pause);
  const resume = useRecorderStore((s) => s.resume);
  const stop = useRecorderStore((s) => s.stop);

  useEffect(() => {
    if (status === "idle") {
      start().catch((err) => console.warn("recorder start failed", err));
    }
  }, [status, start]);

  const meterScale = useSharedValue(0.2);
  useEffect(() => {
    meterScale.value = 0.2 + meter * 0.8;
  }, [meter, meterScale]);

  const meterStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: withTiming(meterScale.value, { duration: 80 }) }],
  }));

  const onStopPress = async () => {
    const out = await stop();
    if (out) onStop(out);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>

      <View style={styles.meterRail}>
        <Animated.View style={[styles.meterBar, meterStyle]} />
      </View>

      <View style={styles.controls}>
        {status === "recording" ? (
          <Pressable onPress={pause} style={styles.controlBtn}>
            <Pause size={24} color={colors.text.primary} />
          </Pressable>
        ) : (
          <Pressable
            onPress={resume}
            style={styles.controlBtn}
            disabled={status === "stopped"}
          >
            <Play size={24} color={colors.text.primary} />
          </Pressable>
        )}
        <Pressable
          onPress={onStopPress}
          style={[styles.controlBtn, styles.stopBtn]}
        >
          <Square
            size={24}
            color={colors.bg.primary}
            fill={colors.bg.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.bg.primary,
  },
  timer: {
    fontSize: 56,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary,
    fontWeight: "200",
    marginBottom: 64,
  },
  meterRail: {
    width: 4,
    height: 96,
    backgroundColor: colors.bg.elevated,
    borderRadius: 2,
    overflow: "hidden",
    justifyContent: "flex-end",
    marginBottom: 64,
  },
  meterBar: {
    width: 4,
    height: "100%",
    backgroundColor: colors.accent.indigo,
    borderRadius: 2,
  },
  controls: {
    flexDirection: "row",
    gap: 32,
    alignItems: "center",
  },
  controlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg.elevated,
  },
  stopBtn: {
    backgroundColor: colors.accent.indigo,
  },
});
