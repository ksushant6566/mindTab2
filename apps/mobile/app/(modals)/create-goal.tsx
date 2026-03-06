import { View, Text, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useCreateGoal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { X } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const priorities = [
  { value: "priority_1", label: "P1", color: "bg-red-500/30" },
  { value: "priority_2", label: "P2", color: "bg-yellow-500/30" },
  { value: "priority_3", label: "P3", color: "bg-green-500/30" },
  { value: "priority_4", label: "P4", color: "bg-secondary" },
];

const impacts = ["low", "medium", "high"] as const;

export default function CreateGoalModal() {
  const router = useRouter();
  const createGoal = useCreateGoal(api);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("priority_2");
  const [impact, setImpact] = useState<string>("medium");

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createGoal.mutate(
      { title: title.trim(), description: description.trim() || undefined, priority, impact },
      {
        onSuccess: () => {
          toast.success("Goal created");
          router.back();
        },
        onError: () => toast.error("Failed to create goal"),
      }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">New Goal</Text>
        <Button size="sm" onPress={handleCreate} loading={createGoal.isPending}>
          Create
        </Button>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Title</Text>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="What do you want to achieve?"
          autoFocus
          className="mb-4"
        />

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details..."
          multiline
          numberOfLines={3}
          className="mb-4"
          style={{ textAlignVertical: "top", minHeight: 80 }}
        />

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Priority</Text>
        <View className="flex-row gap-2 mb-4">
          {priorities.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => setPriority(p.value)}
              className={`flex-1 rounded-md py-2 items-center ${priority === p.value ? p.color : "border border-border"}`}
            >
              <Text className={`text-sm font-semibold ${priority === p.value ? "text-foreground" : "text-muted-foreground"}`}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Impact</Text>
        <View className="flex-row gap-2 mb-4">
          {impacts.map((i) => (
            <Pressable
              key={i}
              onPress={() => setImpact(i)}
              className={`flex-1 rounded-md py-2 items-center ${impact === i ? "bg-secondary" : "border border-border"}`}
            >
              <Text className={`text-sm font-medium capitalize ${impact === i ? "text-foreground" : "text-muted-foreground"}`}>
                {i}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
