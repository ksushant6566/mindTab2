import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCreateGoal, projectsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { AppBottomSheet } from "~/components/ui/app-bottom-sheet";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const priorities = [
  { value: "priority_1", label: "P1", color: colors.priority.p1 },
  { value: "priority_2", label: "P2", color: colors.priority.p2 },
  { value: "priority_3", label: "P3", color: colors.priority.p3 },
  { value: "priority_4", label: "P4", color: colors.priority.p4 },
] as const;

const impacts = [
  { value: "low", label: "Low", color: colors.impact.low },
  { value: "medium", label: "Medium", color: colors.impact.medium },
  { value: "high", label: "High", color: colors.impact.high },
] as const;

export default function CreateGoalModal() {
  const router = useRouter();
  const { projectId: activeProjectId } = useLocalSearchParams<{
    projectId?: string;
  }>();
  const createGoal = useCreateGoal(api);
  const { data: projects } = useQuery(projectsQueryOptions(api));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("priority_2");
  const [impact, setImpact] = useState("medium");
  const [projectId, setProjectId] = useState<string | null>(
    activeProjectId ?? null,
  );

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createGoal.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        impact,
        ...(projectId ? { projectId } : {}),
      },
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
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => router.back()}
      />
      <AppBottomSheet
        snapPoints={["90%"]}
        onClose={() => router.back()}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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
            New Goal
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
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Title
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="What do you want to achieve?"
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
            placeholder="Optional details..."
            multiline
            numberOfLines={3}
            style={{
              textAlignVertical: "top",
              minHeight: 80,
              marginBottom: 20,
            }}
          />

          {/* Priority */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Priority
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {priorities.map((p) => (
              <Chip
                key={p.value}
                label={p.label}
                selected={priority === p.value}
                color={p.color}
                onPress={() => setPriority(p.value)}
              />
            ))}
          </View>

          {/* Impact */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Impact
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 28,
            }}
          >
            {impacts.map((i) => (
              <Chip
                key={i.value}
                label={i.label}
                selected={impact === i.value}
                color={i.color}
                onPress={() => setImpact(i.value)}
              />
            ))}
          </View>

          {/* Project */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Project
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 28,
            }}
          >
            <Chip
              label="None"
              selected={projectId === null}
              color={colors.text.muted}
              onPress={() => setProjectId(null)}
            />
            {projects?.map((p) => (
              <Chip
                key={p.id}
                label={p.name ?? ""}
                selected={projectId === p.id}
                color={colors.accent.indigo}
                onPress={() => setProjectId(p.id)}
              />
            ))}
          </View>

          {/* Create button */}
          <Button
            onPress={handleCreate}
            loading={createGoal.isPending}
            disabled={!title.trim()}
            state={createGoal.isSuccess ? "success" : createGoal.isError ? "error" : "idle"}
            size="lg"
          >
            Create Goal
          </Button>
          <Text
            style={{
              fontSize: 12,
              color: colors.xp.gold,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            +25 XP
          </Text>
        </ScrollView>
      </AppBottomSheet>
    </View>
  );
}
