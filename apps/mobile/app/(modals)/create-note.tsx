import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
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
import { AppBottomSheet } from "~/components/ui/app-bottom-sheet";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

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
  const [didPromptDraft, setDidPromptDraft] = useState(false);

  // Load draft
  const savedDraft = useMemo(() => {
    try {
      const raw = draftStorage.getString(DRAFT_KEY);
      if (raw) return JSON.parse(raw) as { title: string; noteType: string; content: string };
    } catch { /* ignore */ }
    return null;
  }, []);

  const [title, setTitle] = useState(savedDraft?.title ?? "");
  const [content, setContent] = useState(savedDraft?.content ?? "");
  const [noteType, setNoteType] = useState(savedDraft?.noteType ?? "article");
  const [projectId, setProjectId] = useState<string | null>(
    activeProjectId ?? null,
  );

  useEffect(() => {
    if (!savedDraft || didPromptDraft) return;
    setDidPromptDraft(true);
    Alert.alert(
      "Continue draft?",
      "You have an unsaved draft. Would you like to continue?",
      [
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            draftStorage.delete(DRAFT_KEY);
            setTitle("");
            setContent("");
            setNoteType("article");
          },
        },
        { text: "Continue" },
      ],
    );
  }, [didPromptDraft, savedDraft]);

  // Auto-save draft on unmount (dismiss)
  useEffect(() => {
    return () => {
      if (didCreate.current) {
        draftStorage.delete(DRAFT_KEY);
        return;
      }
      if (title.trim() || content.trim()) {
        const draft = { title, noteType, content };
        draftStorage.set(DRAFT_KEY, JSON.stringify(draft));
      }
    };
  }, [title, noteType, content]);

  const handleCreate = useCallback(() => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    // Wrap plain text in <p> tags for the rich editor on the detail screen
    const htmlContent = content.trim()
      ? content.split("\n").filter(Boolean).map((line) => `<p>${line}</p>`).join("")
      : "<p></p>";

    createJournal.mutate(
      {
        title: title.trim(),
        content: htmlContent,
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
  }, [title, content, noteType, projectId]);

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => router.back()}
      />
      <AppBottomSheet
        snapPoints={["90%"]}
        onClose={() => router.back()}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
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
            placeholder="What's on your mind?"
            autoFocus
            style={{ marginBottom: 20 }}
          />

          {/* Content */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Content
          </Text>
          <Input
            value={content}
            onChangeText={setContent}
            placeholder="Start writing..."
            multiline
            numberOfLines={6}
            style={{
              textAlignVertical: "top",
              minHeight: 140,
              marginBottom: 20,
            }}
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
              marginBottom: 20,
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
              marginBottom: 28,
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

          {/* Create button */}
          <Button
            onPress={handleCreate}
            loading={createJournal.isPending}
            disabled={!title.trim()}
            state={createJournal.isSuccess ? "success" : createJournal.isError ? "error" : "idle"}
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
        </ScrollView>
      </AppBottomSheet>
    </View>
  );
}
