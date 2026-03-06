import { View, Text, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { journalQueryOptions, useUpdateJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";
import { useRichEditor, RichTextEditorView } from "~/components/notes/rich-text-editor";

export default function EditNoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const updateJournal = useUpdateJournal(api);

  const [title, setTitle] = useState("");
  const [titleLoaded, setTitleLoaded] = useState(false);

  const editor = useRichEditor({
    initialContent: (note as any)?.content || "",
    editable: true,
  });

  if (!titleLoaded && note) {
    setTitle((note as any).title || "");
    setTitleLoaded(true);
  }

  if (isLoading || !note) return <Loading />;

  const handleSave = async () => {
    const htmlContent = await editor.getHTML();

    updateJournal.mutate(
      { id, title: title.trim(), content: htmlContent },
      {
        onSuccess: () => {
          toast.success("Note saved");
          router.back();
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">Edit Note</Text>
        <Button size="sm" onPress={handleSave} loading={updateJournal.isPending}>
          Save
        </Button>
      </View>

      <View className="px-4 pt-4">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          className="text-lg font-semibold mb-3"
          style={{ fontSize: 18 }}
        />
      </View>

      <View className="flex-1">
        <RichTextEditorView editor={editor} />
      </View>
    </View>
  );
}
