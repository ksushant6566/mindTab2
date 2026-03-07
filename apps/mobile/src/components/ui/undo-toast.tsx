import { useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type UndoToastProps = {
  message: string;
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number; // default 4000ms
};

export function UndoToast({
  message,
  visible,
  onUndo,
  onDismiss,
  duration = 4000,
}: UndoToastProps) {
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const countdown = useSharedValue(1); // 1 = full, 0 = empty

  useEffect(() => {
    if (visible) {
      // Slide in from bottom
      translateY.value = withSpring(0, springs.snappy);
      opacity.value = withTiming(1, { duration: 150 });
      // Start countdown
      countdown.value = 1;
      countdown.value = withTiming(0, { duration });

      // Auto-dismiss after duration
      const timer = setTimeout(() => {
        dismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      translateY.value = withSpring(100, springs.snappy);
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    translateY.value = withSpring(100, springs.snappy);
    opacity.value = withTiming(0, { duration: 150 });
    // Small delay for animation before calling onDismiss
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  const handleUndo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onUndo();
    dismiss();
  }, [onUndo, dismiss]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const countdownStyle = useAnimatedStyle(() => ({
    width: `${countdown.value * 100}%`,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Countdown bar */}
      <View style={styles.countdownTrack}>
        <Animated.View
          style={[styles.countdownFill, countdownStyle]}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <Pressable onPress={handleUndo} style={styles.undoButton}>
          <Text style={styles.undoText}>UNDO</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100, // above tab bar / FAB area
    left: 20,
    right: 20,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 50,
  },
  countdownTrack: {
    height: 3,
    backgroundColor: colors.border.default,
  },
  countdownFill: {
    height: 3,
    backgroundColor: colors.accent.indigo,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
    marginRight: 12,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.accent.indigoMuted,
  },
  undoText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent.indigo,
    letterSpacing: 0.5,
  },
});
