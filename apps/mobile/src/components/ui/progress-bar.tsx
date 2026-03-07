import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
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

  useEffect(() => {
    width.value = withSpring(Math.min(Math.max(value, 0), 1), springs.bouncy);
  }, [value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height }]}>
      <Animated.View
        style={[
          styles.fill,
          { height, backgroundColor: color, borderRadius: height },
          fillStyle,
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
});
