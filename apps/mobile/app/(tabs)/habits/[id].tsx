import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { habitQueryOptions, useUpdateHabit, useDeleteHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ChevronLeft, Trash2, Pencil } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const frequencies = ["daily", "weekdays", "weekends", "weekly"] as const;

export default function HabitDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { data: habit, isLoading } = useQuery(habitQueryOptions(api, id));
  const updateHabit = useUpdateHabit(api);
  const deleteHabit = useDeleteHabit(api);

  const goBack = () => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/habits");
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFrequency, setEditFrequency] = useState<string>("daily");

  if (isLoading || !habit) return <Loading />;

  const h = habit as any;

  const startEditing = () => {
    setEditTitle(h.title || "");
    setEditDescription(h.description || "");
    setEditFrequency(h.frequency || "daily");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    updateHabit.mutate(
      {
        id,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        frequency: editFrequency,
      },
      {
        onSuccess: () => {
          toast.success("Habit updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update habit"),
      }
    );
  };

  const handleDelete = () => {
    Alert.alert("Delete Habit", "Are you sure you want to delete this habit?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteHabit.mutate(id, { onSuccess: () => goBack() });
        },
      },
    ]);
  };

  if (isEditing) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border">
          <Pressable onPress={() => setIsEditing(false)} className="p-1">
            <Text className="text-muted-foreground text-base">Cancel</Text>
          </Pressable>
          <Text className="text-foreground font-semibold text-lg">Edit Habit</Text>
          <Button size="sm" onPress={handleSave} loading={updateHabit.isPending}>
            Save
          </Button>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Title</Text>
          <Input
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Habit title"
            autoFocus
            className="mb-4"
          />

          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
          <Input
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Optional details..."
            multiline
            numberOfLines={2}
            className="mb-4"
            style={{ textAlignVertical: "top", minHeight: 60 }}
          />

          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Frequency</Text>
          <View className="flex-row flex-wrap gap-2">
            {frequencies.map((f) => (
              <Pressable
                key={f}
                onPress={() => setEditFrequency(f)}
                className={`rounded-md px-4 py-2 ${editFrequency === f ? "bg-secondary" : "border border-border"}`}
              >
                <Text className={`text-sm font-medium capitalize ${editFrequency === f ? "text-foreground" : "text-muted-foreground"}`}>
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={goBack} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg flex-1" numberOfLines={1}>
          {h.title}
        </Text>
        <Pressable onPress={startEditing} className="p-1 mr-2">
          <Pencil size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleDelete} className="p-1">
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card className="mb-4">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Title</Text>
          <Text className="text-foreground font-medium">{h.title}</Text>
        </Card>

        {h.description && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</Text>
            <Text className="text-foreground">{h.description}</Text>
          </Card>
        )}

        {h.frequency && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Frequency</Text>
            <Text className="text-foreground capitalize">{h.frequency}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
