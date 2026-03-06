import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { goalQueryOptions, useUpdateGoal, useDeleteGoal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { GoalStatusBadge } from "~/components/goals/goal-status-badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import { colors } from "~/styles/colors";

const statusOptions = ["pending", "in_progress", "completed"] as const;
const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: goal, isLoading } = useQuery(goalQueryOptions(api, id));
  const updateGoal = useUpdateGoal(api);
  const deleteGoal = useDeleteGoal(api);

  if (isLoading || !goal) return <Loading />;

  const handleStatusChange = (status: string) => {
    updateGoal.mutate({
      id,
      status,
      completedAt: status === "completed" ? new Date().toISOString() : null,
    });
  };

  const handleDelete = () => {
    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGoal.mutate(id, { onSuccess: () => router.back() });
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg flex-1" numberOfLines={1}>
          {(goal as any).title}
        </Text>
        <Pressable onPress={handleDelete} className="p-1">
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card className="mb-4">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</Text>
          <View className="flex-row gap-2">
            {statusOptions.map((s) => (
              <Pressable
                key={s}
                onPress={() => handleStatusChange(s)}
                className={`flex-1 rounded-md py-2 items-center ${(goal as any).status === s ? "bg-secondary" : "border border-border"}`}
              >
                <Text className={`text-xs font-medium ${(goal as any).status === s ? "text-foreground" : "text-muted-foreground"}`}>
                  {statusLabels[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {(goal as any).description && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</Text>
            <Text className="text-foreground">{(goal as any).description}</Text>
          </Card>
        )}

        <Card className="mb-4">
          <View className="flex-row justify-between">
            {(goal as any).priority && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Priority</Text>
                <GoalStatusBadge status={(goal as any).priority} />
              </View>
            )}
            {(goal as any).impact && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Impact</Text>
                <Text className="text-foreground capitalize">{(goal as any).impact}</Text>
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
