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
};

function getFlameColor(count: number): string {
  if (count >= 100) return colors.streak.purple;
  if (count >= 30) return colors.streak.purple;
  if (count >= 7) return colors.streak.gold;
  if (count >= 1) return colors.streak.orange;
  return colors.text.muted;
}

export function StreakFlame({ count, size = 16, showCount = true }: StreakFlameProps) {
  const scale = useSharedValue(1);
  const flameColor = getFlameColor(count);

  useEffect(() => {
    if (count > 0) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 600 }),
          withTiming(0.98, { duration: 400 }),
          withTiming(1.0, { duration: 500 }),
        ),
        -1,
        true,
      );
    }
  }, [count]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
});
