import { View, Text, Pressable } from "react-native";
import { useState } from "react";
import { useCreateGoal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner-native";

const priorities = ["priority_1", "priority_2", "priority_3", "priority_4"] as const;
const priorityLabels: Record<string, string> = {
  priority_1: "P1",
  priority_2: "P2",
  priority_3: "P3",
  priority_4: "P4",
};
const priorityColors: Record<string, string> = {
  priority_1: "bg-red-500",
  priority_2: "bg-yellow-500",
  priority_3: "bg-green-500",
  priority_4: "bg-secondary",
};

const impacts = ["low", "medium", "high"] as const;

type CreateGoalStepProps = {
  projectId: string | null;
  onGoalCreated: (title: string) => void;
  onBack: () => void;
};

export function CreateGoalStep({ projectId, onGoalCreated, onBack }: CreateGoalStepProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("priority_1");
  const [impact, setImpact] = useState("medium");
  const createGoal = useCreateGoal(api);

  const handleSubmit = () => {
    if (!title.trim()) return;
    (createGoal.mutate as any)(
      {
        title: title.trim(),
        priority,
        impact,
        projectId: projectId || undefined,
      },
      {
        onSuccess: () => onGoalCreated(title.trim()),
        onError: () => toast.error("Failed to create goal"),
      }
    );
  };

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        Set your first goal
      </Text>
      <Text className="text-muted-foreground text-sm mb-6">
        What do you want to accomplish?
      </Text>

      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        Goal
      </Text>
      <Input
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Learn TypeScript"
        autoFocus
        className="mb-4"
      />

      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        Priority
      </Text>
      <View className="flex-row gap-2 mb-4">
        {priorities.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            className={`flex-row items-center rounded-md px-3 py-2 ${
              priority === p ? "bg-secondary" : "border border-border"
            }`}
          >
            <View className={`w-2.5 h-2.5 rounded-full mr-2 ${priorityColors[p]}`} />
            <Text className={`text-sm font-medium ${priority === p ? "text-foreground" : "text-muted-foreground"}`}>
              {priorityLabels[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        Impact
      </Text>
      <View className="flex-row gap-2 mb-6">
        {impacts.map((i) => (
          <Pressable
            key={i}
            onPress={() => setImpact(i)}
            className={`rounded-md px-4 py-2 ${
              impact === i ? "bg-secondary" : "border border-border"
            }`}
          >
            <Text className={`text-sm font-medium capitalize ${impact === i ? "text-foreground" : "text-muted-foreground"}`}>
              {i}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row gap-3">
        <Button variant="secondary" onPress={onBack} className="flex-1">
          Back
        </Button>
        <Button
          onPress={handleSubmit}
          loading={createGoal.isPending}
          disabled={!title.trim()}
          className="flex-1"
        >
          Add Goal
        </Button>
      </View>
    </View>
  );
}
