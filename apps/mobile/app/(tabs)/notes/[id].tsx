import { View, Text, Pressable, Alert } from "react-native";
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { journalQueryOptions, useDeleteJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { useRichEditor, RichTextEditorView } from "~/components/notes/rich-text-editor";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const deleteJournal = useDeleteJournal(api);

  const editor = useRichEditor({
    initialContent: "",
    editable: false,
  });

  // Update editor content when note data arrives
  useEffect(() => {
    if (note) {
      editor.setContent((note as any).content || "");
    }
  }, [note]);

  if (isLoading || !note) return <Loading />;

  const n = note as any;

  const handleDelete = () => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteJournal.mutate(id, { onSuccess: () => router.back() });
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <View className="flex-1" />
        <Pressable onPress={() => router.push(`/(tabs)/notes/edit/${id}`)} className="p-1 mr-2">
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

      <View className="flex-1">
        <RichTextEditorView editor={editor} showToolbar={false} />
      </View>
    </View>
  );
}
