import { View, Text, ScrollView, Pressable, Alert, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { journalQueryOptions, useDeleteJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Button } from "~/components/ui/button";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react-native";
import { colors } from "~/styles/colors";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Simple HTML renderer for read mode — strips tags and shows plain text.
// A full tentap-editor read-only view can replace this later.
function HtmlContent({ html }: { html: string }) {
  const plain = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  return <Text className="text-foreground leading-6">{plain}</Text>;
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const deleteJournal = useDeleteJournal(api);

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

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text className="text-2xl font-bold text-foreground mb-1">
          {n.title || "Untitled"}
        </Text>
        {n.updatedAt && (
          <Text className="text-muted-foreground text-sm mb-4">
            {formatDate(n.updatedAt)}
          </Text>
        )}
        {n.content && <HtmlContent html={n.content} />}
      </ScrollView>
    </View>
  );
}
