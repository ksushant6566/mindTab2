import { View, Text, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useState, useEffect } from "react";
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

export default function EditNoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const updateJournal = useUpdateJournal(api);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (note) {
      setTitle((note as any).title || "");
      // Strip HTML for plain text editing. Full tentap-editor integration
      // can replace this TextInput later.
      const plain = ((note as any).content || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();
      setContent(plain);
    }
  }, [note]);

  if (isLoading || !note) return <Loading />;

  const handleSave = () => {
    // Wrap plain text back into basic HTML paragraphs
    const htmlContent = content
      .split("\n")
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join("");

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
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground font-semibold text-lg">Edit Note</Text>
        <Button size="sm" onPress={handleSave} loading={updateJournal.isPending}>
          Save
        </Button>
      </View>

      <View className="flex-1 px-4 pt-4">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
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
