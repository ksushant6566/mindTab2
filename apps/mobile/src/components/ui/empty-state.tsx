import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { typography } from "~/styles/tokens";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 1500 }),
        withTiming(-4, { duration: 1500 }),
      ),
      -1,
      true,
    );
  }, [float]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={iconStyle}>
        <Icon size={48} color={colors.text.muted} />
      </Animated.View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionLabel && onAction && (
        <Pressable style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
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
    ...typography.title2,
    color: colors.text.primary,
    marginTop: 16,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: 4,
  },
  actionButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent.indigo,
  },
  actionText: {
    ...typography.callout,
    color: colors.accent.indigo,
  },
});
