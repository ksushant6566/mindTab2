import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useCreateProject } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const statuses = [
  { value: "active", label: "Active", color: colors.status.active },
  { value: "paused", label: "Paused", color: colors.status.paused },
  { value: "completed", label: "Completed", color: colors.status.completed },
  { value: "archived", label: "Archived", color: colors.status.archived },
] as const;

export default function CreateProjectModal() {
  const router = useRouter();
  const createProject = useCreateProject(api);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");

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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.elevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        {/* Handle indicator */}
        <View
          style={{
            alignSelf: "center",
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#404040",
            marginTop: 10,
            marginBottom: 6,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.text.primary,
            }}
          >
            New Project
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: colors.accent.indigo,
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Name
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Project name"
            autoFocus
            style={{ marginBottom: 20 }}
          />

          {/* Description */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Description
          </Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description..."
            multiline
            numberOfLines={3}
            style={{
              textAlignVertical: "top",
              minHeight: 80,
              marginBottom: 20,
            }}
          />

          {/* Status */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Status
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 28,
            }}
          >
            {statuses.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={status === s.value}
                color={s.color}
                onPress={() => setStatus(s.value)}
              />
            ))}
          </View>

          {/* Create button */}
          <Button
            onPress={handleCreate}
            loading={createProject.isPending}
            disabled={!name.trim()}
            state={createProject.isSuccess ? "success" : createProject.isError ? "error" : "idle"}
            size="lg"
          >
            Create Project
          </Button>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
