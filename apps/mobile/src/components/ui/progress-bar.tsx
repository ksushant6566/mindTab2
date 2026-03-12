import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  useSharedValue,
} from "react-native-reanimated";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type ProgressBarProps = {
  value: number;
  color?: string;
  height?: number;
  trackColor?: string;
  glowing?: boolean;
};

export function ProgressBar({
  value,
  color = colors.accent.indigo,
  height = 3,
  trackColor = colors.border.default,
  glowing = false,
}: ProgressBarProps) {
  const width = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const prevValue = useRef(value);

  useEffect(() => {
    // Trigger shimmer when value increases
    if (value > prevValue.current) {
      shimmer.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 500 }),
      );
    }
    prevValue.current = value;
    width.value = withSpring(Math.min(Math.max(value, 0), 1), springs.bouncy);
  }, [value]);

  useEffect(() => {
    if (glowing) {
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.3, { duration: 600 }),
        ),
        -1,
        true,
      );
    } else {
      glowPulse.value = withTiming(0, { duration: 300 });
    }
  }, [glowing]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.6,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: colors.xp.gold,
    shadowOpacity: glowPulse.value * 0.8,
    shadowRadius: 8,
    elevation: glowPulse.value > 0 ? 4 : 0,
  }));

  return (
    <Animated.View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: 999 }, glowing && glowStyle]}>
      <Animated.View
        style={[
          styles.fill,
          { height, backgroundColor: glowing ? colors.xp.gold : color, borderRadius: 999 },
          fillStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.shimmerOverlay,
          { height, borderRadius: 999 },
          shimmerStyle,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  shimmerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
  },
});
