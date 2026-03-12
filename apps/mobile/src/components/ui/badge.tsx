import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from "react-native";
import { colors } from "~/styles/colors";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

type BadgeProps = {
  variant?: BadgeVariant;
  children: string;
  className?: string;
};

const variantBg: Record<BadgeVariant, ViewStyle> = {
  default: { backgroundColor: colors.text.primary },
  secondary: { backgroundColor: colors.bg.surface },
  destructive: { backgroundColor: colors.feedback.error },
  outline: { borderWidth: 1, borderColor: colors.border.default, backgroundColor: "transparent" },
  success: { backgroundColor: "rgba(34,197,94,0.2)" },
  warning: { backgroundColor: "rgba(251,191,36,0.2)" },
};

const variantText: Record<BadgeVariant, string> = {
  default: colors.bg.primary,
  secondary: colors.text.primary,
  destructive: "#ffffff",
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
