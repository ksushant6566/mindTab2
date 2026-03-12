import { View, Text } from "react-native";
import { useState } from "react";
import { useCreateProject } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner-native";

type CreateProjectStepProps = {
  onProjectCreated: (projectId: string, projectName: string) => void;
  onBack: () => void;
  alreadyCreated: boolean;
  initialName: string;
};

export function CreateProjectStep({
  onProjectCreated,
  onBack,
  alreadyCreated,
  initialName,
}: CreateProjectStepProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const createProject = useCreateProject(api);

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (alreadyCreated) {
      onProjectCreated("", name.trim());
      return;
    }
    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
      },
      {
        onSuccess: (project: any) => {
          if (project) onProjectCreated(project.id, name.trim());
        },
        onError: () => toast.error("Failed to create project"),
      }
    );
  };

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        Create your first project
      </Text>
      <Text className="text-muted-foreground text-sm mb-6">
        Projects group your goals and notes into focused spaces.
      </Text>

      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        Name
      </Text>
      <Input
        value={name}
        onChangeText={setName}
        placeholder="e.g. Career Growth"
        autoFocus
        className="mb-4"
      />

      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        Description
      </Text>
      <Input
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description..."
        multiline
        numberOfLines={2}
        className="mb-6"
        style={{ textAlignVertical: "top", minHeight: 60 }}
      />

      <View className="flex-row gap-3">
        <Button variant="secondary" onPress={onBack} className="flex-1">
          Back
        </Button>
        <Button
          onPress={handleSubmit}
          loading={createProject.isPending}
          disabled={!name.trim()}
          className="flex-1"
        >
          {alreadyCreated ? "Continue" : "Create"}
        </Button>
      </View>
    </View>
  );
}
