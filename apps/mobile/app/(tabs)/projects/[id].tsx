import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  projectQueryOptions,
  goalsQueryOptions,
  journalsQueryOptions,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
} from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { GoalItem } from "~/components/goals/goal-item";
import { NoteCard } from "~/components/notes/note-card";
import { ChevronLeft, Trash2, Archive, Pencil } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const statuses = ["planning", "active", "on_hold", "completed"] as const;

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: project, isLoading } = useQuery(projectQueryOptions(api, id));
  const { data: goals = [] } = useQuery(goalsQueryOptions(api, { projectId: id }));
  const { data: notes = [] } = useQuery(journalsQueryOptions(api, { projectId: id }));
  const updateProject = useUpdateProject(api);
  const deleteProject = useDeleteProject(api);
  const archiveProject = useArchiveProject(api);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<string>("active");

  if (isLoading || !project) return <Loading />;

  const p = project as any;

  const startEditing = () => {
    setEditName(p.name || "");
    setEditDescription(p.description || "");
    setEditStatus(p.status || "active");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }
    updateProject.mutate(
      {
        id,
        name: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      },
      {
        onSuccess: () => {
          toast.success("Project updated");
          setIsEditing(false);
        },
        onError: () => toast.error("Failed to update project"),
      }
    );
  };

  const handleDelete = () => {
    Alert.alert("Delete Project", "This will delete the project. Goals and notes will be unlinked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteProject.mutate(id, { onSuccess: () => router.back() });
        },
      },
    ]);
  };

  const handleArchive = () => {
    archiveProject.mutate(id, {
      onSuccess: () => {
        toast.success("Project archived");
        router.back();
      },
    });
  };

  if (isEditing) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border">
          <Pressable onPress={() => setIsEditing(false)} className="p-1">
            <Text className="text-muted-foreground text-base">Cancel</Text>
          </Pressable>
          <Text className="text-foreground font-semibold text-lg">Edit Project</Text>
          <Button size="sm" onPress={handleSave} loading={updateProject.isPending}>
            Save
          </Button>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Name</Text>
          <Input
            value={editName}
            onChangeText={setEditName}
            placeholder="Project name"
            autoFocus
            className="mb-4"
          />

          <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Description</Text>
          <Input
            value={editDescription}
            onChangeText={setEditDescription}
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
                onPress={() => setEditStatus(s)}
                className={`rounded-md px-4 py-2 ${editStatus === s ? "bg-secondary" : "border border-border"}`}
              >
                <Text className={`text-sm font-medium capitalize ${editStatus === s ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.replace("_", " ")}
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
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg flex-1" numberOfLines={1}>
          {p.name}
        </Text>
        <Pressable onPress={startEditing} className="p-1 mr-2">
          <Pencil size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleArchive} className="p-1 mr-2">
          <Archive size={20} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={handleDelete} className="p-1">
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {p.description && (
          <Card className="mb-4">
            <Text className="text-foreground">{p.description}</Text>
          </Card>
        )}

        <View className="flex-row gap-2 mb-4">
          {p.status && <Badge variant="secondary">{p.status.replace("_", " ")}</Badge>}
          {p.startDate && (
            <Badge variant="outline">
              {new Date(p.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {p.endDate && ` - ${new Date(p.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </Badge>
          )}
        </View>

        {/* Goals section */}
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Goals ({(goals as any[]).length})
        </Text>
        {(goals as any[]).length === 0 ? (
          <Text className="text-muted-foreground text-sm mb-4">No goals in this project.</Text>
        ) : (
          <View className="mb-4">
            {(goals as any[]).map((goal: any) => (
              <GoalItem key={goal.id} goal={goal} />
            ))}
          </View>
        )}

        {/* Notes section */}
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Notes ({(notes as any[]).length})
        </Text>
        {(notes as any[]).length === 0 ? (
          <Text className="text-muted-foreground text-sm">No notes in this project.</Text>
        ) : (
          <View>
            {(notes as any[]).map((note: any) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
