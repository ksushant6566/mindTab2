import { useEffect } from "react";
import { StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";
import { ConfettiBurst } from "./confetti-burst";

type LevelUpOverlayProps = {
  level: number;
  visible: boolean;
  onComplete: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export function LevelUpOverlay({
  level,
  visible,
  onComplete,
}: LevelUpOverlayProps) {
  // Backdrop
  const backdropOpacity = useSharedValue(0);
  // "LEVEL UP" text
  const titleScale = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  // Level number
  const levelScale = useSharedValue(2);
  const levelOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      backdropOpacity.value = 0;
      titleScale.value = 0;
      titleOpacity.value = 0;
      levelScale.value = 2;
      levelOpacity.value = 0;
      return;
    }

    // Haptic on appear
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // 1. Backdrop fades in
    backdropOpacity.value = withTiming(1, { duration: 200 });

    // 2. "LEVEL UP" bounces in
    titleOpacity.value = withDelay(100, withTiming(1, { duration: 100 }));
    titleScale.value = withDelay(100, withSpring(1, springs.bouncy));

    // 3. Level number scales 2 -> 1
    levelOpacity.value = withDelay(300, withTiming(1, { duration: 100 }));
    levelScale.value = withDelay(300, withSpring(1, springs.bouncy));

    // 4. Auto-dismiss after 2 seconds
    const timer = setTimeout(() => {
      backdropOpacity.value = withTiming(0, { duration: 300 });
      titleOpacity.value = withDelay(0, withTiming(0, { duration: 200 }));
      levelOpacity.value = withDelay(0, withTiming(0, { duration: 200 }));

      const exitTimer = setTimeout(() => {
        runOnJS(onComplete)();
      }, 350);

      return () => clearTimeout(exitTimer);
    }, 2000);

    return () => clearTimeout(timer);
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
    opacity: titleOpacity.value,
  }));

  const levelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: levelScale.value }],
    opacity: levelOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, backdropStyle]}>
      {/* "LEVEL UP" */}
      <Animated.Text style={[styles.titleText, titleStyle]}>
        LEVEL UP
      </Animated.Text>

      {/* Level number */}
      <Animated.Text style={[styles.levelText, levelStyle]}>
        Level {level}
      </Animated.Text>

      {/* Confetti */}
      <ConfettiBurst particleCount={24} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  titleText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.xp.gold,
    letterSpacing: 2,
    marginBottom: 8,
  },
  levelText: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.text.primary,
  },
});
