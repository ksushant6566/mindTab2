import { View, Text, Pressable } from "react-native";
import { CheckSquare, Square } from "lucide-react-native";
import { colors } from "~/styles/colors";
import * as Haptics from "expo-haptics";

type HabitCardProps = {
  habit: { id: string; title: string; description?: string | null };
  isCompleted: boolean;
  onToggle: () => void;
  onXpChange?: (delta: number) => void;
};

export function HabitCard({ habit, isCompleted, onToggle, onXpChange }: HabitCardProps) {
  const handlePress = async () => {
    if (isCompleted) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onXpChange?.(10);
    }
    onToggle();
  };

  return (
    <Pressable
      onPress={handlePress}
      className={`flex-row items-center rounded-lg border p-4 mb-2 ${isCompleted ? "border-emerald-800 bg-emerald-950/30" : "border-border bg-card"}`}
    >
      {isCompleted ? (
        <CheckSquare size={22} color="#34d399" />
      ) : (
        <Square size={22} color={colors.mutedForeground} />
      )}
      <View className="ml-3 flex-1">
        <Text className={`font-medium ${isCompleted ? "text-emerald-300 line-through" : "text-foreground"}`}>
          {habit.title}
        </Text>
        {habit.description && (
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            {habit.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
