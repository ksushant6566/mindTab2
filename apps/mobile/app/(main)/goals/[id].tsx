import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { goalQueryOptions, useUpdateGoal, useDeleteGoal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { GoalStatusBadge } from "~/components/goals/goal-status-badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { ChevronLeft, Trash2, Pencil } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const statusOptions = ["pending", "in_progress", "completed"] as const;
const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const priorities = [
  { value: "priority_1", label: "P1", color: "bg-red-500/30" },
  { value: "priority_2", label: "P2", color: "bg-yellow-500/30" },
  { value: "priority_3", label: "P3", color: "bg-green-500/30" },
  { value: "priority_4", label: "P4", color: "bg-secondary" },
];

const impacts = ["low", "medium", "high"] as const;

export default function GoalDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();

  const goBack = () => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/goals");
    }
  };
  const { data: goal, isLoading } = useQuery(goalQueryOptions(api, id));
  const updateGoal = useUpdateGoal(api);
  const deleteGoal = useDeleteGoal(api);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editImpact, setEditImpact] = useState("");

  if (isLoading || !goal) return <Loading />;

  const g = goal as any;

  const startEditing = () => {
    setEditTitle(g.title || "");
    setEditDescription(g.description || "");
    setEditPriority(g.priority || "priority_2");
    setEditImpact(g.impact || "medium");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    updateGoal.mutate(
      {
        id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        impact: editImpact,
      },
      {
        onSuccess: () => {
          toast.success("Goal updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update goal"),
      }
    );
  };

  const handleStatusChange = (status: string) => {
    updateGoal.mutate({
      id,
      status,
      completedAt: status === "completed" ? new Date().toISOString() : null,
    });
  };

  const handleDelete = () => {
    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGoal.mutate(id, { onSuccess: () => goBack() });
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
          <Text className="text-foreground font-semibold text-lg">Edit Goal</Text>
          <Button size="sm" onPress={handleSave} loading={updateGoal.isPending}>
            Save
          </Button>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Title</Text>
          <Input
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Goal title"
            autoFocus
            className="mb-4"
          />

          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
          <Input
            value={editDescription}
            onChangeText={setEditDescription}
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
                onPress={() => setEditPriority(p.value)}
                className={`flex-1 rounded-md py-2 items-center ${editPriority === p.value ? p.color : "border border-border"}`}
              >
                <Text className={`text-sm font-semibold ${editPriority === p.value ? "text-foreground" : "text-muted-foreground"}`}>
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
                onPress={() => setEditImpact(i)}
                className={`flex-1 rounded-md py-2 items-center ${editImpact === i ? "bg-secondary" : "border border-border"}`}
              >
                <Text className={`text-sm font-medium capitalize ${editImpact === i ? "text-foreground" : "text-muted-foreground"}`}>
                  {i}
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
          {g.title}
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
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</Text>
          <View className="flex-row gap-2">
            {statusOptions.map((s) => (
              <Pressable
                key={s}
                onPress={() => handleStatusChange(s)}
                className={`flex-1 rounded-md py-2 items-center ${g.status === s ? "bg-secondary" : "border border-border"}`}
              >
                <Text className={`text-xs font-medium ${g.status === s ? "text-foreground" : "text-muted-foreground"}`}>
                  {statusLabels[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {g.description && (
          <Card className="mb-4">
            <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</Text>
            <Text className="text-foreground">{g.description}</Text>
          </Card>
        )}

        <Card className="mb-4">
          <View className="flex-row justify-between">
            {g.priority && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Priority</Text>
                <GoalStatusBadge status={g.priority} />
              </View>
            )}
            {g.impact && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Impact</Text>
                <Text className="text-foreground capitalize">{g.impact}</Text>
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
