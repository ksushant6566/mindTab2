import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type ProgressBarProps = {
  value: number;
  color?: string;
  height?: number;
  trackColor?: string;
};

export function ProgressBar({
  value,
  color = colors.accent.indigo,
  height = 3,
  trackColor = colors.border.default,
}: ProgressBarProps) {
  const width = useSharedValue(0);
  const shimmer = useSharedValue(0);
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

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.6,
  }));

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: 999 }]}>
      <Animated.View
        style={[
          styles.fill,
          { height, backgroundColor: color, borderRadius: 999 },
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
    </View>
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
