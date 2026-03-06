import { View, Text, Pressable } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useCreateJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { X } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";
import { useRichEditor, RichTextEditorView } from "~/components/notes/rich-text-editor";

export default function CreateNoteModal() {
  const router = useRouter();
  const createJournal = useCreateJournal(api);
  const [title, setTitle] = useState("");

  const editor = useRichEditor({ initialContent: "" });

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const htmlContent = await editor.getHTML();

    createJournal.mutate(
      { title: title.trim(), content: htmlContent || "<p></p>" },
      {
        onSuccess: () => {
          toast.success("Note created");
          router.back();
        },
        onError: () => toast.error("Failed to create note"),
      }
    );
  }, [title, editor]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">New Note</Text>
        <Button size="sm" onPress={handleCreate} loading={createJournal.isPending}>
          Create
        </Button>
      </View>

      <View className="px-4 pt-4">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          autoFocus
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
