import { View, Text, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { journalQueryOptions, useDeleteJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { NoteContentView } from "~/components/notes/note-content-view";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function NoteDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const deleteJournal = useDeleteJournal(api);

  const goBack = () => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/notes");
    }
  };

  if (isLoading || !note) return <Loading />;

  const n = note as any;

  const currentRoute = `/(main)/notes/${id}`;

  const handleMentionPress = (type: string, mentionId: string) => {
    const params = { from: currentRoute };
    switch (type) {
      case "goal":
        router.push({ pathname: `/(main)/goals/[id]`, params: { id: mentionId, ...params } });
        break;
      case "habit":
        router.push({ pathname: `/(main)/habits/[id]`, params: { id: mentionId, ...params } });
        break;
      case "journal":
        router.push({ pathname: `/(main)/notes/[id]`, params: { id: mentionId, ...params } });
        break;
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteJournal.mutate(id, { onSuccess: () => goBack() });
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={goBack} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <View className="flex-1" />
        <Pressable onPress={() => router.push(`/(main)/notes/edit/${id}`)} className="p-1 mr-2">
          <Pencil size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleDelete} className="p-1">
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <View className="px-4 pt-2 mb-2">
        <Text className="text-2xl font-bold text-foreground mb-1">
          {n.title || "Untitled"}
        </Text>
        {n.updatedAt && (
          <Text className="text-muted-foreground text-sm">
            {formatDate(n.updatedAt)}
          </Text>
        )}
      </View>

      <View className="flex-1 px-4">
        <NoteContentView
          content={n.content || ""}
          onMentionPress={handleMentionPress}
        />
      </View>
    </View>
  );
}
