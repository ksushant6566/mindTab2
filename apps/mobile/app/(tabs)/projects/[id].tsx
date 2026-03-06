import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  projectQueryOptions,
  goalsQueryOptions,
  journalsQueryOptions,
  useDeleteProject,
  useArchiveProject,
} from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { GoalItem } from "~/components/goals/goal-item";
import { NoteCard } from "~/components/notes/note-card";
import { ChevronLeft, Trash2, Archive } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: project, isLoading } = useQuery(projectQueryOptions(api, id));
  const { data: goals = [] } = useQuery(goalsQueryOptions(api, { projectId: id }));
  const { data: notes = [] } = useQuery(journalsQueryOptions(api, { projectId: id }));
  const deleteProject = useDeleteProject(api);
  const archiveProject = useArchiveProject(api);

  if (isLoading || !project) return <Loading />;

  const p = project as any;

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

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg flex-1" numberOfLines={1}>
          {p.name}
        </Text>
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
