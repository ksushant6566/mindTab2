import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCreateJournal, projectsQueryOptions } from "@mindtab/core";
import { MMKV } from "react-native-mmkv";

const draftStorage = new MMKV({ id: "mindtab-drafts" });
const DRAFT_KEY = "create-note-draft";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";
import { useRichEditor, RichTextEditorView } from "~/components/notes/rich-text-editor";

const noteTypes = [
  { value: "article", label: "Article", color: colors.noteType.article },
  { value: "book", label: "Book", color: colors.noteType.book },
  { value: "video", label: "Video", color: colors.noteType.video },
  { value: "podcast", label: "Podcast", color: colors.noteType.podcast },
  { value: "website", label: "Website", color: colors.noteType.website },
] as const;

export default function CreateNoteModal() {
  const router = useRouter();
  const { projectId: activeProjectId } = useLocalSearchParams<{
    projectId?: string;
  }>();
  const createJournal = useCreateJournal(api);
  const { data: projects } = useQuery(projectsQueryOptions(api));
  const didCreate = useRef(false);

  // Load draft
  const savedDraft = useMemo(() => {
    try {
      const raw = draftStorage.getString(DRAFT_KEY);
      if (raw) return JSON.parse(raw) as { title: string; noteType: string; content: string };
    } catch { /* ignore */ }
    return null;
  }, []);

  const [title, setTitle] = useState(savedDraft?.title ?? "");
  const [noteType, setNoteType] = useState(savedDraft?.noteType ?? "article");
  const [projectId, setProjectId] = useState<string | null>(
    activeProjectId ?? null,
  );

  const editor = useRichEditor({
    initialContent: savedDraft?.content ?? "",
  });

  // Auto-save draft on unmount (dismiss)
  useEffect(() => {
    return () => {
      if (didCreate.current) {
        // Successfully created, clear draft
        draftStorage.delete(DRAFT_KEY);
        return;
      }
      // Save draft if there's any content
      if (title.trim()) {
        const draft = { title, noteType, content: "" };
        draftStorage.set(DRAFT_KEY, JSON.stringify(draft));
      }
    };
  }, [title, noteType]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const htmlContent = await editor.getHTML();

    createJournal.mutate(
      {
        title: title.trim(),
        content: htmlContent || "<p></p>",
        type: noteType,
        ...(projectId ? { projectId } : {}),
      },
      {
        onSuccess: () => {
          didCreate.current = true;
          draftStorage.delete(DRAFT_KEY);
          toast.success("Note created");
          router.back();
        },
        onError: () => toast.error("Failed to create note"),
      }
    );
  }, [title, editor, noteType]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.elevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        {/* Handle indicator */}
        <View
          style={{
            alignSelf: "center",
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#404040",
            marginTop: 10,
            marginBottom: 6,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.text.primary,
            }}
          >
            New Note
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: colors.accent.indigo,
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>

        {/* Title input */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Title
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            autoFocus
            style={{ fontSize: 18, marginBottom: 16 }}
          />

          {/* Type chips */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Type
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {noteTypes.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={noteType === t.value}
                color={t.color}
                size="sm"
                onPress={() => setNoteType(t.value)}
              />
            ))}
          </View>

          {/* Project */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Project
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Chip
              label="None"
              selected={projectId === null}
              color={colors.text.muted}
              onPress={() => setProjectId(null)}
            />
            {projects?.map((p) => (
              <Chip
                key={p.id}
                label={p.name ?? ""}
                selected={projectId === p.id}
                color={colors.accent.indigo}
                onPress={() => setProjectId(p.id)}
              />
            ))}
          </View>
        </View>

        {/* Rich text editor */}
        <View style={{ flex: 1 }}>
          <RichTextEditorView editor={editor} />
        </View>

        {/* Create button */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 }}>
          <Button
            onPress={handleCreate}
            loading={createJournal.isPending}
            size="lg"
          >
            Create Note
          </Button>
          <Text
            style={{
              fontSize: 12,
              color: colors.xp.gold,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            +5 XP
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
