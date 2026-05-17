import { useEffect } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { ButtonSize, ButtonVariant } from "@mindtab/shared";
import { Check, X } from "lucide-react-native";
import { springs } from "~/lib/animations";
import { colors } from "~/styles/colors";
import { radii } from "~/styles/tokens";
type ButtonState = "idle" | "loading" | "success" | "error";

type ButtonProps = PressableProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Show success/error state briefly after mutation completes */
  state?: ButtonState;
  children: React.ReactNode;
  className?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  default: { backgroundColor: colors.accent.ink },
  secondary: { backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default },
  destructive: { backgroundColor: colors.feedback.error },
  ghost: {},
  outline: { borderWidth: 1, borderColor: colors.border.default, backgroundColor: "transparent" },
  link: {},
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  default: { paddingHorizontal: 16, paddingVertical: 10 },
  sm: { paddingHorizontal: 12, paddingVertical: 6 },
  lg: { paddingHorizontal: 24, paddingVertical: 12 },
  icon: { padding: 8 },
};

const textColorMap: Record<ButtonVariant, string> = {
  default: colors.bg.primary,
  secondary: colors.text.primary,
  destructive: colors.white,
  ghost: colors.text.primary,
  outline: colors.text.primary,
  link: colors.accent.ink,
};

export function Button({
  variant = "default",
  size = "default",
  loading,
  state,
  children,
  className,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const isEnabled = !loading && !props.disabled && state !== "loading";
  const effectiveState: ButtonState = loading ? "loading" : state ?? "idle";

  // Item 18: Subtle pulse 1.0→1.01 when enabled (2s loop)
  const pulse = useSharedValue(1);
  const scaleVal = useSharedValue(1);
  useEffect(() => {
    if (isEnabled && effectiveState === "idle") {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.01, { duration: 1000 }),
          withTiming(1.0, { duration: 1000 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [isEnabled, effectiveState]);

  // Item 19/20: Flash color on success/error
  const flashProgress = useSharedValue(0);
  useEffect(() => {
    if (effectiveState === "success") {
      flashProgress.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 600 }),
      );
    } else if (effectiveState === "error") {
      flashProgress.value = withSequence(
        withTiming(-1, { duration: 200 }),
        withTiming(0, { duration: 600 }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [effectiveState]);

  const animatedStyle = useAnimatedStyle(() => {
    const bgColor =
      flashProgress.value > 0
        ? interpolateColor(
            flashProgress.value,
            [0, 1],
            ["transparent", "rgba(34,197,94,0.3)"],
          )
        : flashProgress.value < 0
          ? interpolateColor(
              flashProgress.value,
              [-1, 0],
              ["rgba(239,68,68,0.3)", "transparent"],
            )
          : "transparent";

    return {
      transform: [{ scale: pulse.value * scaleVal.value }],
      shadowColor: bgColor,
    };
  });

  // Determine content
  let content: React.ReactNode;
  if (effectiveState === "loading") {
    content = (
      <ActivityIndicator
        size="small"
        color={variant === "default" ? colors.bg.primary : colors.text.primary}
      />
    );
  } else if (effectiveState === "success") {
    content = <Check size={18} color={colors.feedback.success} strokeWidth={3} />;
  } else if (effectiveState === "error") {
    content = <X size={18} color={colors.feedback.error} strokeWidth={3} />;
  } else if (typeof children === "string") {
    content = (
      <Text style={[styles.text, { color: textColorMap[variant] }]}>
        {children}
      </Text>
    );
  } else {
    content = children;
  }

  return (
    <AnimatedPressable
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        (loading || props.disabled) && styles.disabled,
        style as ViewStyle,
        animatedStyle,
      ]}
      disabled={!isEnabled}
      onPressIn={(event) => {
        if (isEnabled) {
          scaleVal.value = withSpring(0.97, springs.snappy);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scaleVal.value = withSpring(1, springs.snappy);
        onPressOut?.(event);
      }}
      {...props}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
  },
  disabled: {
    backgroundColor: colors.border.default,
    opacity: 1,
  },
});
