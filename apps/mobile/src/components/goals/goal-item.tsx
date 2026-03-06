import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "~/components/ui/card";
import { GoalStatusBadge } from "./goal-status-badge";

const priorityLabels: Record<string, string> = {
  priority_1: "P1",
  priority_2: "P2",
  priority_3: "P3",
  priority_4: "P4",
};

const priorityColors: Record<string, string> = {
  priority_1: "text-red-400",
  priority_2: "text-yellow-400",
  priority_3: "text-green-400",
  priority_4: "text-muted-foreground",
};

type GoalItemProps = {
  goal: {
    id: string;
    title: string;
    status: string;
    priority?: string | null;
    impact?: string | null;
    projectId?: string | null;
  };
};

export function GoalItem({ goal }: GoalItemProps) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push(`/(tabs)/goals/${goal.id}`)}>
      <Card className="mb-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-foreground font-medium" numberOfLines={1}>
              {goal.title}
            </Text>
          </View>
          <GoalStatusBadge status={goal.status} />
        </View>
        {(goal.priority || goal.impact) && (
          <View className="flex-row items-center gap-2 mt-2">
            {goal.priority && (
              <Text className={`text-xs font-semibold ${priorityColors[goal.priority] ?? "text-muted-foreground"}`}>
                {priorityLabels[goal.priority] ?? goal.priority}
              </Text>
            )}
            {goal.impact && (
              <Text className="text-xs text-muted-foreground capitalize">
                {goal.impact} impact
              </Text>
            )}
          </View>
        )}
      </Card>
    </Pressable>
  );
}
