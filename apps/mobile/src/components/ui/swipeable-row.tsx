import { type ReactNode, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  clamp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { springs } from "~/lib/animations";

const SCREEN_WIDTH = Dimensions.get("window").width;

type SwipeAction = {
  label: string;
  icon?: ReactNode;
  color: string;
  onAction: () => void;
};

type SwipeableRowProps = {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightActions?: SwipeAction[];
  snapThreshold?: number;
};

export function SwipeableRow({
  children,
  leftAction,
  rightActions,
  snapThreshold: thresholdProp = 0.35,
}: SwipeableRowProps) {
  const translateX = useSharedValue(0);
  const hasSnapped = useSharedValue(false);
  const rowHeight = useSharedValue<number | null>(null);
  const collapseProgress = useSharedValue(1);

  const snapThreshold = SCREEN_WIDTH * thresholdProp;

  const hapticSnap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const triggerLeft = () => leftAction?.onAction();
  const triggerRight = (index: number) => rightActions?.[index]?.onAction();

  const collapseRow = useCallback(() => {
    collapseProgress.value = withSpring(0, { damping: 18, stiffness: 350 });
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      const maxRight = leftAction ? snapThreshold + 20 : 0;
      const maxLeft = rightActions ? -(snapThreshold + 20) : 0;
      translateX.value = clamp(event.translationX, maxLeft, maxRight);

      if (Math.abs(translateX.value) >= snapThreshold && !hasSnapped.value) {
        hasSnapped.value = true;
        runOnJS(hapticSnap)();
      }
      if (Math.abs(translateX.value) < snapThreshold && hasSnapped.value) {
        hasSnapped.value = false;
      }
    })
    .onEnd(() => {
      if (translateX.value >= snapThreshold && leftAction) {
        runOnJS(triggerLeft)();
      } else if (translateX.value <= -snapThreshold && rightActions?.length) {
        // Collapse the row then trigger the action
        runOnJS(collapseRow)();
        runOnJS(triggerRight)(0);
      }
      translateX.value = withSpring(0, springs.snappy);
      hasSnapped.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, snapThreshold], [0, 1]),
  }));

  const rightBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -snapThreshold], [0, 1]),
  }));

  const collapseStyle = useAnimatedStyle(() => {
    if (collapseProgress.value >= 1) return {};
    return {
      height: rowHeight.value != null ? rowHeight.value * collapseProgress.value : undefined,
      opacity: collapseProgress.value,
      overflow: "hidden" as const,
      marginBottom: 8 * collapseProgress.value,
    };
  });

  const handleLayout = useCallback((e: any) => {
    if (rowHeight.value == null) {
      rowHeight.value = e.nativeEvent.layout.height;
    }
  }, []);

  return (
    <Animated.View style={[styles.container, collapseStyle]} onLayout={handleLayout}>
      {leftAction && (
        <Animated.View
          style={[
            styles.actionBg,
            styles.leftBg,
            { backgroundColor: leftAction.color },
            leftBgStyle,
          ]}
        >
          {leftAction.icon}
          <Text style={styles.actionLabel}>{leftAction.label}</Text>
        </Animated.View>
      )}

      {rightActions && rightActions.length > 0 && (
        <Animated.View
          style={[
            styles.actionBg,
            styles.rightBg,
            { backgroundColor: rightActions[0].color },
            rightBgStyle,
          ]}
        >
          <Text style={styles.actionLabel}>{rightActions[0].label}</Text>
          {rightActions[0].icon}
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    marginBottom: 8,
  },
  actionBg: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    borderRadius: 16,
  },
  leftBg: {
    justifyContent: "flex-start",
  },
  rightBg: {
    justifyContent: "flex-end",
  },
  actionLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
