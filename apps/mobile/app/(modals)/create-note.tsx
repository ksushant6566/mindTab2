import { View, Text, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useCreateJournal } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { X } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

export default function CreateNoteModal() {
  const router = useRouter();
  const createJournal = useCreateJournal(api);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    // Wrap plain text into basic HTML paragraphs
    const htmlContent = content
      .split("\n")
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join("");

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
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">New Note</Text>
        <Button size="sm" onPress={handleCreate} loading={createJournal.isPending}>
          Create
        </Button>
      </View>

      <View className="flex-1 px-4 pt-4">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          autoFocus
          className="text-lg font-semibold mb-3"
          style={{ fontSize: 18 }}
        />
        <Input
          value={content}
          onChangeText={setContent}
          placeholder="Write your thoughts..."
          multiline
          className="flex-1"
          style={{ textAlignVertical: "top", minHeight: 200 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
