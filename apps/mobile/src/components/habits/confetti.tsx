import { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const PARTICLE_COUNT = 12;
const COLORS = ["#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#fb923c"];
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ConfettiProps = {
  onComplete: () => void;
};

function Particle({ color, delay, startX }: { color: string; delay: number; startX: number }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const spreadX = (Math.random() - 0.5) * 160;
    const riseY = -(80 + Math.random() * 120);

    scale.value = withDelay(delay, withTiming(1, { duration: 150 }));
    translateY.value = withDelay(
      delay,
      withTiming(riseY, { duration: 800, easing: Easing.out(Easing.cubic) })
    );
    translateX.value = withDelay(
      delay,
      withTiming(spreadX, { duration: 800, easing: Easing.out(Easing.cubic) })
    );
    rotate.value = withDelay(
      delay,
      withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration: 800 })
    );
    opacity.value = withDelay(
      delay + 500,
      withTiming(0, { duration: 300 })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: startX,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ onComplete }: ConfettiProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle
          key={i}
          color={COLORS[i % COLORS.length]}
          delay={i * 30}
          startX={-3 + (Math.random() - 0.5) * 20}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    overflow: "visible",
    zIndex: 10,
  },
});
