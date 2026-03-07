import { useEffect, useRef } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Star } from "lucide-react-native";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type PerfectDayBannerProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function PerfectDayBanner({ visible, onDismiss }: PerfectDayBannerProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!visible) {
      translateY.value = withSpring(-100, springs.smooth);
      opacity.value = withSpring(0, springs.smooth);
      return;
    }

    // Haptic on appear
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Slide down
    translateY.value = withSpring(0, springs.smooth);
    opacity.value = withSpring(1, springs.smooth);

    // Auto-dismiss after 3 seconds
    dismissTimer.current = setTimeout(() => {
      dismiss();
    }, 3000);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible]);

  const dismiss = () => {
    translateY.value = withSpring(-100, springs.smooth);
    opacity.value = withSpring(0, springs.smooth);
    setTimeout(() => {
      runOnJS(onDismiss)();
    }, 300);
  };

  // Swipe up to dismiss
  const pan = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationY < -20) {
        runOnJS(dismiss)();
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      }
    });

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.banner, bannerStyle]}>
        <Animated.View style={styles.content}>
          <Star
            size={20}
            color={colors.xp.gold}
            fill={colors.xp.gold}
          />
          <Animated.View style={styles.textGroup}>
            <Animated.View style={styles.titleRow}>
              <Text style={styles.title}>PERFECT DAY</Text>
              <Text style={styles.xpText}>+15 XP bonus</Text>
            </Animated.View>
            <Text style={styles.subtitle}>All habits completed!</Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: `${colors.xp.gold}26`, // 15% opacity
    borderWidth: 1,
    borderColor: `${colors.xp.gold}40`,
    padding: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textGroup: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.xp.gold,
    letterSpacing: 1,
  },
  xpText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.secondary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
