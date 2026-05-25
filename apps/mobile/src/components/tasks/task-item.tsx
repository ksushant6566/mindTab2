import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "~/components/ui/card";
import { TaskStatusBadge } from "./task-status-badge";

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

type TaskItemProps = {
  task: {
    id: string;
    title: string;
    status: string;
    priority?: string | null;
    impact?: string | null;
    projectId?: string | null;
  };
};

export function TaskItem({ task }: TaskItemProps) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push(`/(main)/tasks/${task.id}`)}>
      <Card className="mb-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-foreground font-medium" numberOfLines={1}>
              {task.title}
            </Text>
          </View>
          <TaskStatusBadge status={task.status} />
        </View>
        {(task.priority || task.impact) && (
          <View className="flex-row items-center gap-2 mt-2">
            {task.priority && (
              <Text className={`text-xs font-semibold ${priorityColors[task.priority] ?? "text-muted-foreground"}`}>
                {priorityLabels[task.priority] ?? task.priority}
              </Text>
            )}
            {task.impact && (
              <Text className="text-xs text-muted-foreground capitalize">
                {task.impact} impact
              </Text>
            )}
          </View>
        )}
      </Card>
    </Pressable>
  );
}
