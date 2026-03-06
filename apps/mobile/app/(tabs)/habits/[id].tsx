import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { habitQueryOptions, useUpdateHabit, useDeleteHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Card } from "~/components/ui/card";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import { colors } from "~/styles/colors";

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: habit, isLoading } = useQuery(habitQueryOptions(api, id));
  const deleteHabit = useDeleteHabit(api);

  if (isLoading || !habit) return <Loading />;

  const handleDelete = () => {
    Alert.alert("Delete Habit", "Are you sure you want to delete this habit?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteHabit.mutate(id, { onSuccess: () => router.back() });
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
          {(habit as any).title}
        </Text>
        <Pressable onPress={handleDelete} className="p-1">
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card className="mb-4">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Title</Text>
          <Text className="text-foreground font-medium">{(habit as any).title}</Text>
        </Card>

        {(habit as any).description && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</Text>
            <Text className="text-foreground">{(habit as any).description}</Text>
          </Card>
        )}

        {(habit as any).frequency && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Frequency</Text>
            <Text className="text-foreground capitalize">{(habit as any).frequency}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
