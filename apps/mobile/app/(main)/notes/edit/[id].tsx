import { View, Text, Pressable, StyleSheet } from "react-native";
import { useState, useRef } from "react";
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
import type { useEditorBridge } from "@10play/tentap-editor";

function NoteEditor({
  content,
  editorRef,
}: {
  content: string;
  editorRef: React.MutableRefObject<ReturnType<typeof useEditorBridge> | null>;
}) {
  const editor = useRichEditor({ initialContent: content, editable: true });
  editorRef.current = editor;
  return <RichTextEditorView editor={editor} />;
}

export default function EditNoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const updateJournal = useUpdateJournal(api);
  const editorRef = useRef<ReturnType<typeof useEditorBridge> | null>(null);

  const [title, setTitle] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (isLoading || !note) return <Loading />;

  const n = note as any;
  if (!loaded) {
    setTitle(n.title || "");
    setLoaded(true);
  }

  const handleSave = async () => {
    const htmlContent = await editorRef.current?.getHTML();

    updateJournal.mutate(
      { id, title: title.trim(), content: htmlContent || "" },
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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Note</Text>
        <Button size="sm" onPress={handleSave} loading={updateJournal.isPending}>
          Save
        </Button>
      </View>

      <View style={styles.titleContainer}>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          style={{ fontSize: 18 }}
        />
      </View>

      <View style={styles.editorContainer}>
        <NoteEditor content={n.content || ""} editorRef={editorRef} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
  },
  titleContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  editorContainer: {
    flex: 1,
  },
});
