import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors } from "~/styles/colors";

type ButtonVariant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = PressableProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
};

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  default: { backgroundColor: colors.text.primary },
  secondary: { backgroundColor: colors.bg.surface },
  destructive: { backgroundColor: colors.feedback.error },
  ghost: {},
  outline: { borderWidth: 1, borderColor: colors.border.default },
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
  destructive: "#ffffff",
  ghost: colors.text.primary,
  outline: colors.text.primary,
};

export function Button({
  variant = "default",
  size = "default",
  loading,
  children,
  className,
  style,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        props.disabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "default" ? colors.bg.primary : colors.text.primary}
        />
      ) : typeof children === "string" ? (
        <Text style={[styles.text, { color: textColorMap[variant] }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.5,
  },
});
