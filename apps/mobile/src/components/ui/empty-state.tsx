import { View, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "~/styles/colors";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Icon size={48} color={colors.mutedForeground} />
      <Text className="text-foreground font-semibold text-lg mt-4">{title}</Text>
      {description && (
        <Text className="text-muted-foreground text-center mt-1">{description}</Text>
      )}
    </View>
  );
}
