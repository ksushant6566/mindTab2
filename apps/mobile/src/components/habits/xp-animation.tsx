import { useEffect } from "react";
import { Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
} from "react-native-reanimated";

type XpAnimationProps = {
  delta: number;
  onComplete: () => void;
};

export function XpAnimation({ delta, onComplete }: XpAnimationProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: 600 }),
      withTiming(0, { duration: 400 }, () => {
        runOnJS(onComplete)();
      })
    );
    translateY.value = withTiming(-60, { duration: 1200 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[animatedStyle, { position: "absolute", top: -10, alignSelf: "center" }]}
    >
      <Text className={`font-bold text-lg ${delta > 0 ? "text-amber-400" : "text-red-400"}`}>
        {delta > 0 ? `+${delta}` : delta} XP
      </Text>
    </Animated.View>
  );
}
