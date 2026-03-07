import { View, Text, StyleSheet } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "~/styles/colors";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Icon size={48} color={colors.text.muted} />
      <Text style={styles.title}>{title}</Text>
      {description && (
        <Text style={styles.description}>{description}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    marginTop: 16,
  },
  description: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 4,
  },
});
