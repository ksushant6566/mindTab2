import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type ConfettiBurstProps = {
  particleCount?: number;
  colors?: readonly string[];
  onComplete?: () => void;
};

function Particle({
  color,
  delay,
  angle,
  distance,
}: {
  color: string;
  delay: number;
  angle: number;
  distance: number;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance - 40;

    scale.value = withDelay(delay, withSpring(1, springs.bouncy));
    translateX.value = withDelay(delay, withSpring(targetX, springs.bouncy));
    translateY.value = withDelay(delay, withSpring(targetY, springs.bouncy));
    rotate.value = withDelay(
      delay,
      withSpring(360 * (Math.random() > 0.5 ? 1 : -1), springs.bouncy)
    );
    opacity.value = withDelay(delay + 500, withTiming(0, { duration: 300 }));
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
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function ConfettiBurst({
  particleCount = 12,
  colors: particleColors = colors.confetti,
  onComplete,
}: ConfettiBurstProps) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const distance = 60 + Math.random() * 80;
        return (
          <Particle
            key={i}
            color={particleColors[i % particleColors.length]}
            delay={i * 20}
            angle={angle}
            distance={distance}
          />
        );
      })}
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
