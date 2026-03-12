import { Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";
import type { ReactNode } from "react";

type ChipProps = {
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: "sm" | "md";
};

export function Chip({
  label,
  icon,
  selected = false,
  color = colors.accent.indigo,
  onPress,
  onLongPress,
  size = "md",
}: ChipProps) {
  const scale = useSharedValue(1);

  const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const fireLongPress = () => onLongPress?.();

  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(selected ? 0.95 : 1.08, selected ? springs.snappy : springs.bouncy);
      runOnJS(haptic)();
    })
    .onFinalize((_, success) => {
      scale.value = withSpring(1, springs.snappy);
      if (success && onPress) runOnJS(onPress)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      if (onLongPress) {
        runOnJS(haptic)();
        runOnJS(fireLongPress)();
      }
    });

  const composed = onLongPress
    ? Gesture.Race(tap, longPress)
    : tap;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const paddingH = size === "sm" ? 10 : 14;
  const paddingV = size === "sm" ? 5 : 8;
  const fontSize = size === "sm" ? 12 : 14;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            borderRadius: 999,
            paddingHorizontal: paddingH,
            paddingVertical: paddingV,
            backgroundColor: selected ? color + "26" : colors.bg.surface,
            borderWidth: 1,
            borderColor: selected ? color + "40" : colors.border.default,
          },
          animatedStyle,
        ]}
      >
        {icon}
        <Text
          style={{
            fontSize,
            fontWeight: "500",
            color: selected ? color : colors.text.secondary,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}
