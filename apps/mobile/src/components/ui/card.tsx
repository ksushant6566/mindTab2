import { View, StyleSheet, type ViewProps, type ViewStyle } from "react-native";
import { colors } from "~/styles/colors";

type CardProps = ViewProps & {
  className?: string;
};

export function Card({ className, children, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, style as ViewStyle]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    padding: 16,
  },
});
