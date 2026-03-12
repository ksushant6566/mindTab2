import { View, Text, Pressable } from "react-native";
import { useState } from "react";
import { useCreateHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner-native";
import {
  Dumbbell,
  BookOpen,
  Brain,
  Droplets,
  PenLine,
  Moon,
  Salad,
  Plus,
} from "lucide-react-native";
import { colors } from "~/styles/colors";

const PRESETS = [
  { title: "Exercise", desc: "Stay active every day", Icon: Dumbbell },
  { title: "Read", desc: "Read for 30 minutes", Icon: BookOpen },
  { title: "Meditate", desc: "Practice mindfulness", Icon: Brain },
  { title: "Drink Water", desc: "Stay hydrated", Icon: Droplets },
  { title: "Journal", desc: "Write daily reflections", Icon: PenLine },
  { title: "Sleep Early", desc: "Lights off by 11pm", Icon: Moon },
  { title: "Eat Healthy", desc: "No junk food", Icon: Salad },
];

type Phase = "picking" | "custom" | "done";

type CreateHabitStepProps = {
  onHabitCreated: () => void;
  onBack: () => void;
};

export function CreateHabitStep({ onHabitCreated, onBack }: CreateHabitStepProps) {
  const [phase, setPhase] = useState<Phase>("picking");
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const createHabit = useCreateHabit(api);

  const handlePreset = (title: string, description: string) => {
    (createHabit.mutate as any)(
      { title, description, frequency: "daily" },
      {
        onSuccess: () => {
          setPhase("done");
          onHabitCreated();
        },
        onError: () => toast.error("Failed to create habit"),
      }
    );
  };

  const handleCustomSubmit = () => {
    if (!customTitle.trim()) return;
    (createHabit.mutate as any)(
      { title: customTitle.trim(), description: customDesc.trim(), frequency: "daily" },
      {
        onSuccess: () => {
          setPhase("done");
          onHabitCreated();
        },
        onError: () => toast.error("Failed to create habit"),
      }
    );
  };

  if (phase === "done") {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Text className="text-2xl font-bold text-foreground mb-2">Habit created!</Text>
        <Text className="text-muted-foreground text-sm text-center mb-2">
          You'll earn <Text className="text-amber-400 font-semibold">10 XP</Text> every time you check it off.
        </Text>
      </View>
    );
  }

  if (phase === "custom") {
    return (
      <View className="flex-1 justify-center px-6">
        <Text className="text-2xl font-bold text-foreground mb-2">
          Create a custom habit
        </Text>
        <Text className="text-muted-foreground text-sm mb-6">
          What do you want to do every day?
        </Text>

        <Input
          value={customTitle}
          onChangeText={setCustomTitle}
          placeholder="Habit name"
          autoFocus
          className="mb-3"
        />
        <Input
          value={customDesc}
          onChangeText={setCustomDesc}
          placeholder="Description (optional)"
          className="mb-6"
        />

        <View className="flex-row gap-3">
          <Button variant="secondary" onPress={() => setPhase("picking")} className="flex-1">
            Back
          </Button>
          <Button
            onPress={handleCustomSubmit}
            loading={createHabit.isPending}
            disabled={!customTitle.trim()}
            className="flex-1"
          >
            Add Habit
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        Build your first habit
      </Text>
      <Text className="text-muted-foreground text-sm mb-6">
        Pick a habit to track daily, or create your own.
      </Text>

      <View className="mb-4">
        {PRESETS.map((p) => (
          <Pressable
            key={p.title}
            onPress={() => handlePreset(p.title, p.desc)}
            disabled={createHabit.isPending}
            className="flex-row items-center py-3 border-b border-border/30"
          >
            <View className="w-9 h-9 rounded-lg bg-emerald-500/10 items-center justify-center mr-3">
              <p.Icon size={18} color="#34d399" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-medium text-sm">{p.title}</Text>
              <Text className="text-muted-foreground text-xs">{p.desc}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setPhase("custom")}
          className="flex-row items-center py-3"
        >
          <View className="w-9 h-9 rounded-lg border border-dashed border-border items-center justify-center mr-3">
            <Plus size={18} color={colors.mutedForeground} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-medium text-sm">Custom</Text>
            <Text className="text-muted-foreground text-xs">Create your own</Text>
          </View>
        </Pressable>
      </View>

      <Button variant="secondary" onPress={onBack}>
        Back
      </Button>
    </View>
  );
}
