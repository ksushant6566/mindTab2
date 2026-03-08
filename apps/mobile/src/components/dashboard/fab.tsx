import React, { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
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
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  Plus,
  Target,
  CheckSquare,
  FileText,
  FolderPlus,
} from "lucide-react-native";

import { colors } from "~/styles/colors";
import { springs } from "~/lib/animations";

type FABProps = {
  visible: boolean;
  contextFilter?: "goal" | "habit" | "note" | "project";
};

const MENU_OPTIONS = [
  {
    key: "goal" as const,
    label: "Goal",
    Icon: Target,
    route: "/(modals)/create-goal" as const,
    translateX: -75,
    translateY: -80,
  },
  {
    key: "habit" as const,
    label: "Habit",
    Icon: CheckSquare,
    route: "/(modals)/create-habit" as const,
    translateX: -25,
    translateY: -120,
  },
  {
    key: "note" as const,
    label: "Note",
    Icon: FileText,
    route: "/(modals)/create-note" as const,
    translateX: 25,
    translateY: -120,
  },
  {
    key: "project" as const,
    label: "Project",
    Icon: FolderPlus,
    route: "/(modals)/create-project" as const,
    translateX: 75,
    translateY: -80,
  },
];

const STAGGER_MS = 50;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FAB({ visible, contextFilter }: FABProps) {
  const router = useRouter();
  const isOpen = useSharedValue(0);
  const visibleOptions = contextFilter
    ? MENU_OPTIONS.filter((option) => option.key === contextFilter)
    : MENU_OPTIONS;

  // FAB visibility (hide when scrolling down)
  const fabTranslateStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withSpring(visible ? 0 : 100, springs.snappy),
      },
    ],
  }));

  // Plus icon rotation (0 -> 45deg when open)
  const plusRotationStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotateZ: `${withSpring(
          interpolate(isOpen.value, [0, 1], [0, 45]),
          springs.snappy,
        )}deg`,
      },
    ],
  }));

  // Backdrop opacity
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isOpen.value, { duration: 200 }),
    pointerEvents: isOpen.value > 0.5 ? "auto" : "none",
  }));

  const toggleMenu = useCallback(() => {
    const nextValue = isOpen.value > 0.5 ? 0 : 1;
    isOpen.value = withSpring(nextValue, springs.snappy);
    if (nextValue === 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isOpen]);

  const closeMenu = useCallback(() => {
    isOpen.value = withSpring(0, springs.snappy);
  }, [isOpen]);

  const handleOptionPress = useCallback(
    (route: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      closeMenu();
      router.push(route as never);
    },
    [closeMenu, router],
  );

  const showLongPressMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(main)/goals" as never);
  }, [router]);

  const fabTapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(toggleMenu)();
  });

  const fabLongPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(showLongPressMenu)();
    });

  const fabGesture = Gesture.Race(fabTapGesture, fabLongPress);

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      </Animated.View>

      {/* FAB container (anchors radial menu items) */}
      <Animated.View style={[styles.fabContainer, fabTranslateStyle]}>
        {/* Radial menu options */}
        {visibleOptions.map((option, index) => (
          <MenuOption
            key={option.key}
            option={option}
            index={index}
            isOpen={isOpen}
            onPress={handleOptionPress}
          />
        ))}

        {/* FAB button */}
        <GestureDetector gesture={fabGesture}>
          <Animated.View style={styles.fab}>
            <Animated.View style={plusRotationStyle}>
              <Plus size={28} color="#ffffff" strokeWidth={2.5} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

// ---------- Menu option sub-component ----------

type MenuOptionProps = {
  option: (typeof MENU_OPTIONS)[number];
  index: number;
  isOpen: Animated.SharedValue<number>;
  onPress: (route: string) => void;
};

function MenuOption({ option, index, isOpen, onPress }: MenuOptionProps) {
  const { Icon, label, route, translateX, translateY } = option;

  const animatedStyle = useAnimatedStyle(() => {
    // Stagger: each subsequent option starts slightly later
    // We model this by adjusting the interpolation input range
    const staggerOffset = index * (STAGGER_MS / 300); // normalized stagger
    const adjustedProgress = interpolate(
      isOpen.value,
      [staggerOffset, 0.6 + staggerOffset],
      [0, 1],
      "clamp",
    );

    const tx = interpolate(adjustedProgress, [0, 1], [0, translateX]);
    const ty = interpolate(adjustedProgress, [0, 1], [0, translateY]);
    const scale = interpolate(
      adjustedProgress,
      [0, 0.7, 1],
      [0, 1.1, 1],
    );
    const opacity = interpolate(adjustedProgress, [0, 0.3], [0, 1], "clamp");

    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      opacity,
    };
  });

  return (
    <AnimatedPressable
      style={[styles.optionContainer, animatedStyle]}
      onPress={() => onPress(route)}
    >
      <View style={styles.optionButton}>
        <Icon size={22} color={colors.text.primary} />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 90,
  },
  fabContainer: {
    position: "absolute",
    bottom: 24,
    right: 20,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // Android elevation
    elevation: 8,
  },
  optionContainer: {
    position: "absolute",
    alignItems: "center",
  },
  optionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    // Android elevation
    elevation: 6,
  },
  optionLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
});
