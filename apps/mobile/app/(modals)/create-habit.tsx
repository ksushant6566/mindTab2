import { View, Text, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useCreateHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { X } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const frequencies = ["daily", "weekdays", "weekends", "weekly"] as const;

export default function CreateHabitModal() {
  const router = useRouter();
  const createHabit = useCreateHabit(api);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<string>("daily");

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createHabit.mutate(
      { title: title.trim(), description: description.trim() || undefined, frequency },
      {
        onSuccess: () => {
          toast.success("Habit created");
          router.back();
        },
        onError: () => toast.error("Failed to create habit"),
      }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">New Habit</Text>
        <Button size="sm" onPress={handleCreate} loading={createHabit.isPending}>
          Create
        </Button>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Title</Text>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Read for 30 minutes"
          autoFocus
          className="mb-4"
        />

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
        <Input
          value={description}
          onChangeText={setDescription}
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
              onPress={() => setFrequency(f)}
              className={`rounded-md px-4 py-2 ${frequency === f ? "bg-secondary" : "border border-border"}`}
            >
              <Text className={`text-sm font-medium capitalize ${frequency === f ? "text-foreground" : "text-muted-foreground"}`}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
