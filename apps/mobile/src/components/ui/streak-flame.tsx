import { View, Text, StyleSheet } from "react-native";
import { Flame } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useEffect } from "react";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type StreakFlameProps = {
  count: number;
  size?: number;
  showCount?: boolean;
  burst?: boolean;
  /** Render the count overlaid on top of the flame icon */
  overlay?: boolean;
};

export function getFlameColor(count: number): string {
  if (count >= 100) return colors.streak.purple; // rainbow animation handled separately
  if (count >= 30) return colors.streak.purple;
  if (count >= 7) return colors.streak.gold;
  if (count >= 1) return colors.streak.orange;
  return colors.text.muted;
}

export function StreakFlame({
  count,
  size = 16,
  showCount = true,
  burst = false,
  overlay = false,
}: StreakFlameProps) {
  const scale = useSharedValue(1);
  const flameColor = getFlameColor(count);

  useEffect(() => {
    if (count > 0) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 700 }),
          withTiming(0.98, { duration: 500 }),
          withTiming(1.0, { duration: 800 }),
        ),
        -1,
        true,
      );
    }
  }, [count]);

  useEffect(() => {
    if (burst) {
      scale.value = withSequence(
        withSpring(1.4, springs.bouncy),
        withSpring(1.0, springs.snappy),
      );
    }
  }, [burst, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (overlay) {
    const overlayFontSize = size * 0.38;
    return (
      <View style={styles.overlayContainer}>
        <Animated.View style={animatedStyle}>
          <Flame
            size={size}
            color={flameColor}
            fill={count > 0 ? flameColor : "transparent"}
          />
          {showCount && count > 0 && (
            <View style={styles.overlayTextWrap}>
              <Text
                style={[
                  styles.overlayCount,
                  { fontSize: overlayFontSize, lineHeight: overlayFontSize * 1.2 },
                ]}
              >
                {count}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <Flame size={size} color={flameColor} fill={count > 0 ? flameColor : "transparent"} />
      </Animated.View>
      {showCount && count > 0 && (
        <Text style={[styles.count, { color: flameColor }]}>{count}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  count: {
    fontSize: 13,
    fontWeight: "600",
  },
  overlayContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  overlayTextWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  overlayCount: {
    fontWeight: "800",
    color: "#0a0a0a",
    textAlign: "center",
  },
});
