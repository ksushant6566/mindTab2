import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Modal,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle } from "react-native-svg";
import { X } from "lucide-react-native";
import { habitsQueryOptions, habitTrackerQueryOptions } from "@mindtab/core";

import { HabitsSection } from "./habits-section";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";
import { springs, timing } from "~/lib/animations";

const BUBBLE_SIZE = 48;

export function HabitsBubble() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const { data: habits } = useQuery(habitsQueryOptions(api));
  const { data: tracker } = useQuery(habitTrackerQueryOptions(api));

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0]!, []);

  const { totalCount, completedCount } = useMemo(() => {
    const total = habits?.length ?? 0;
    let completed = 0;
    if (habits && tracker) {
      const completedSet = new Set<string>();
      for (const entry of tracker) {
        if (
          (entry as any).date === todayStr &&
          (entry as any).status === "completed"
        ) {
          completedSet.add((entry as any).habitId);
        }
      }
      completed = habits.filter((h: any) => completedSet.has(h.id)).length;
    }
    return { totalCount: total, completedCount: completed };
  }, [habits, tracker, todayStr]);

  // --- Popup animation ---
  const progress = useSharedValue(0);
  // Snapshot of where the bubble was when tapped
  const [bubbleSnap, setBubbleSnap] = useState({ x: 0, y: 0 });

  const openAtPosition = useCallback((bx: number, by: number) => {
    setBubbleSnap({ x: bx, y: by });
    setOpen(true);
    progress.value = withTiming(1, timing.normal);
  }, []);

  const handleClose = useCallback(() => {
    progress.value = withTiming(0, timing.fast, (finished) => {
      if (finished) runOnJS(setOpen)(false);
    });
  }, []);

  // Close popup when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        setOpen(false);
        progress.value = 0;
      };
    }, []),
  );

  // Popup placement derived from bubble snapshot
  const showBelow =
    bubbleSnap.y + BUBBLE_SIZE / 2 < screenHeight / 2;
  const popupWidth = screenWidth - 32;
  const originXPct = Math.max(
    0,
    Math.min(100, ((bubbleSnap.x + BUBBLE_SIZE / 2 - 16) / popupWidth) * 100),
  );
  const popupVerticalPos = showBelow
    ? { top: bubbleSnap.y + BUBBLE_SIZE + 8 }
    : { bottom: screenHeight - bubbleSnap.y + 8 };
  const availableSpace = showBelow
    ? screenHeight - (bubbleSnap.y + BUBBLE_SIZE + 8) - insets.bottom - 16
    : bubbleSnap.y - 8 - insets.top - 16;
  const maxPopupHeight = Math.min(availableSpace, screenHeight * 0.6);
  const transformOriginStr = `${Math.round(originXPct)}% ${showBelow ? "0%" : "100%"}`;
  const slideDir = showBelow ? -1 : 1;

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const popupStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.85, 1]) },
      { translateY: interpolate(progress.value, [0, 1], [slideDir * 20, 0]) },
    ],
  }));

  // --- Draggable bubble position ---
  const posX = useSharedValue(screenWidth - 16 - BUBBLE_SIZE);
  const posY = useSharedValue(insets.top + 48);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      dragStartX.value = posX.value;
      dragStartY.value = posY.value;
      isDragging.value = true;
    })
    .onUpdate((e) => {
      posX.value = dragStartX.value + e.translationX;
      posY.value = dragStartY.value + e.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      // Snap to nearest horizontal edge
      const midX = posX.value + BUBBLE_SIZE / 2;
      posX.value = withSpring(
        midX > screenWidth / 2 ? screenWidth - 16 - BUBBLE_SIZE : 16,
        springs.snappy,
      );
      // Clamp Y within safe bounds
      const minY = insets.top + 8;
      const maxY = screenHeight - insets.bottom - BUBBLE_SIZE - 80;
      const clampedY = Math.max(minY, Math.min(maxY, posY.value));
      posY.value = withSpring(clampedY, springs.snappy);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(openAtPosition)(posX.value, posY.value);
  });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const bubbleDragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value },
      { translateY: posY.value },
      { scale: isDragging.value ? 1.1 : 1 },
    ],
  }));

  if (totalCount === 0) return null;

  const allDone = completedCount === totalCount && totalCount > 0;
  const accentColor = allDone ? colors.xp.gold : colors.accent.indigo;

  const RING_SIZE = 38;
  const STROKE = 3;
  const RADIUS = (RING_SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progressOffset =
    CIRCUMFERENCE * (1 - completedCount / totalCount);

  return (
    <>
      {/* Draggable progress ring bubble */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.bubble, bubbleDragStyle]}>
          <View
            style={[styles.bubbleGlow, { shadowColor: accentColor }]}
          />
          <View style={styles.bubbleInner}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={colors.border.default}
                strokeWidth={STROKE}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={accentColor}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${CIRCUMFERENCE}`}
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                rotation={-90}
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
            <Text style={[styles.bubbleCount, { color: accentColor }]}>
              {completedCount}/{totalCount}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Popup modal */}
      <Modal
        transparent
        visible={open}
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        {/* Backdrop */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Popup card — positioned relative to bubble */}
        <Animated.View
          style={[
            styles.popup,
            popupVerticalPos,
            {
              maxHeight: maxPopupHeight,
              transformOrigin: transformOriginStr,
            },
            popupStyle,
          ]}
        >
          {/* Popup header */}
          <View style={styles.popupHeader}>
            <Text style={styles.popupTitle}>TODAY'S HABITS</Text>
            <View style={styles.popupHeaderRight}>
              <Text style={[styles.popupCount, { color: accentColor }]}>
                {completedCount}/{totalCount}
              </Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <X size={16} color={colors.text.muted} />
              </Pressable>
            </View>
          </View>

          {/* Scrollable habits content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
            contentContainerStyle={styles.popupContent}
          >
            <HabitsSection embedded />
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  bubbleInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleCount: {
    position: "absolute",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  backdrop: {
    backgroundColor: "#000",
  },

  popup: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: colors.bg.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  popupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  popupTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.text.muted,
  },
  popupHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  popupCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  popupContent: {
    padding: 12,
  },
});
