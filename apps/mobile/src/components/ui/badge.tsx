import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from "react-native";
import type { BadgeVariant } from "@mindtab/shared";
import { colors } from "~/styles/colors";

type BadgeProps = {
  variant?: BadgeVariant;
  children: string;
  className?: string;
};

const variantBg: Record<BadgeVariant, ViewStyle> = {
  default: { backgroundColor: colors.accent.ink },
  secondary: { backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default },
  destructive: { backgroundColor: colors.feedback.error },
  outline: { borderWidth: 1, borderColor: colors.border.default, backgroundColor: "transparent" },
  success: { backgroundColor: "rgba(34,197,94,0.2)" },
  warning: { backgroundColor: "rgba(251,191,36,0.2)" },
};

const variantText: Record<BadgeVariant, string> = {
  default: colors.bg.primary,
  secondary: colors.text.primary,
  destructive: colors.white,
  outline: colors.text.primary,
  success: colors.feedback.success,
  warning: colors.feedback.warning,
};

export function Badge({ variant = "secondary", children }: BadgeProps) {
  return (
    <View style={[styles.badge, variantBg[variant]]}>
      <Text style={[styles.text, { color: variantText[variant] }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
  },
});
