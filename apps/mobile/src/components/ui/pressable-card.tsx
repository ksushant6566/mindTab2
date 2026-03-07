import { type ReactNode } from "react";
import { StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";

type PressableCardProps = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PressableCard({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
}: PressableCardProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const hapticFeedback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(0.97, springs.snappy);
      opacity.value = withTiming(0.8, { duration: 100 });
      runOnJS(hapticFeedback)();
    })
    .onFinalize((_, success) => {
      scale.value = withSpring(1, springs.snappy);
      opacity.value = withTiming(1, { duration: 100 });
      if (success && onPress) {
        runOnJS(onPress)();
      }
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(500)
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composed = Gesture.Exclusive(longPress, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.card, style, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    padding: 16,
    marginBottom: 8,
  },
});
