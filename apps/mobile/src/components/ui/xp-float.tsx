import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type XPFloatProps = {
  amount: number;
  onComplete?: () => void;
};

export function XPFloat({ amount, onComplete }: XPFloatProps) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 100 });
    scale.value = withSpring(1, springs.bouncy);
    translateY.value = withSpring(-50, springs.smooth);
    opacity.value = withDelay(700, withTiming(0, { duration: 200 }));

    const timer = setTimeout(() => onComplete?.(), 1000);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const isPositive = amount > 0;

  return (
    <Animated.Text
      style={[
        styles.text,
        {
          color: isPositive ? colors.xp.gold : colors.feedback.error,
          fontSize: Math.abs(amount) >= 25 ? 18 : 16,
        },
        style,
      ]}
    >
      {isPositive ? "+" : ""}{amount} XP
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    position: "absolute",
    top: -10,
    alignSelf: "center",
    fontWeight: "700",
    zIndex: 20,
  },
});
