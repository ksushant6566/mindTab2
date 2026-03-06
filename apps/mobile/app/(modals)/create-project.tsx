import { View, Text, ScrollView, Pressable } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useCreateProject } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { X } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const statuses = ["planning", "active", "on_hold", "completed"] as const;

export default function CreateProjectModal() {
  const router = useRouter();
  const createProject = useCreateProject(api);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("active");

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        startDate: new Date().toISOString().split("T")[0],
      },
      {
        onSuccess: () => {
          toast.success("Project created");
          router.back();
        },
        onError: () => toast.error("Failed to create project"),
      }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">New Project</Text>
        <Button size="sm" onPress={handleCreate} loading={createProject.isPending}>
          Create
        </Button>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Name</Text>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Project name"
          autoFocus
          className="mb-4"
        />

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description..."
          multiline
          numberOfLines={3}
          className="mb-4"
          style={{ textAlignVertical: "top", minHeight: 80 }}
        />

        <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Status</Text>
        <View className="flex-row flex-wrap gap-2">
          {statuses.map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              className={`rounded-md px-4 py-2 ${status === s ? "bg-secondary" : "border border-border"}`}
            >
              <Text className={`text-sm font-medium capitalize ${status === s ? "text-foreground" : "text-muted-foreground"}`}>
                {s.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
