import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  journalQueryOptions,
  goalQueryOptions,
  habitQueryOptions,
  useDeleteJournal,
  useUpdateJournal,
} from "@mindtab/core";
import * as Haptics from "expo-haptics";
import { api } from "~/lib/api-client";
import { Loading } from "~/components/ui/loading";
import {
  ChevronLeft,
  Edit3,
  MoreHorizontal,
  Trash2,
} from "lucide-react-native";
import { colors } from "~/styles/colors";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
} from "react-native-reanimated";
import BottomSheet from "@gorhom/bottom-sheet";
import { MentionPeekSheet } from "~/components/reader/mention-peek-sheet";
import { NotePager } from "~/components/reader/note-pager";
import { springs } from "~/lib/animations";
import { readerTypography } from "~/styles/tokens";
import {
  useRichEditor,
  RichTextEditorView,
} from "~/components/notes/rich-text-editor";
import type { useEditorBridge } from "@10play/tentap-editor";
import {
  MentionSearchSheet,
  type MentionResult,
} from "~/components/notes/mention-search-sheet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string | undefined | null): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MentionEntity = {
  type: "goal" | "habit" | "note";
  id: string;
  title: string;
  status?: string;
  priority?: string;
  impact?: string;
  projectName?: string;
  streak?: number;
  frequency?: string;
  createdAt?: string;
};

// ---------------------------------------------------------------------------
// In-place editor sub-component (hooks must be called unconditionally)
// ---------------------------------------------------------------------------

function InPlaceEditor({
  content,
  editorRef,
  onContentChange,
  onMentionPress,
}: {
  content: string;
  editorRef: React.MutableRefObject<ReturnType<typeof useEditorBridge> | null>;
  onContentChange?: () => void;
  onMentionPress?: () => void;
}) {
  const editor = useRichEditor({
    initialContent: content,
    editable: true,
    onChange: onContentChange,
  });
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);
  return (
    <RichTextEditorView editor={editor} onMentionPress={onMentionPress} />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NoteDetailScreen() {
  const { id, from, projectId: filterProjectId, editing } = useLocalSearchParams<{
    id: string;
    from?: string;
    projectId?: string;
    editing?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { data: note, isLoading } = useQuery(
    journalQueryOptions(api, id),
  );
  const deleteJournal = useDeleteJournal(api);

  // ---------------------------------------------------------------------------
  // Header visibility — starts hidden, fades in after entry animation
  // ---------------------------------------------------------------------------
  const headerVisible = useSharedValue(0);
  const headerOpacity = useAnimatedStyle(() => {
    const isShowing = headerVisible.value > 0.5;
    return {
      opacity: withTiming(headerVisible.value, { duration: isShowing ? 150 : 200 }),
      pointerEvents: isShowing ? "auto" as const : "none" as const,
    };
  });

  // ---------------------------------------------------------------------------
  // Entry animation — card-to-reader morph on initial open
  // ---------------------------------------------------------------------------
  const entryScale = useSharedValue(0.95);
  const entryOpacity = useSharedValue(0);
  const entryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entryScale.value }],
    opacity: entryOpacity.value,
  }));

  useEffect(() => {
    entryScale.value = withSequence(
      withTiming(0.95, { duration: 0 }),
      withSpring(1, springs.smooth),
    );
    entryOpacity.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 300 }),
    );
    headerVisible.value = withSequence(
      withTiming(0, { duration: 0 }),
      withDelay(400, withTiming(1, { duration: 150 })),
    );
  }, []);

  const toggleHeader = useCallback(() => {
    headerVisible.value = headerVisible.value > 0.5 ? 0 : 1;
  }, [headerVisible]);

  // ---------------------------------------------------------------------------
  // Dismiss gesture — vertical swipe down + pinch to close
  // ---------------------------------------------------------------------------
  const dismissTranslateY = useSharedValue(0);

  const dismissAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.min(dismissTranslateY.value / 200, 1);
    return {
      transform: [{ scale: 1 - progress * 0.15 }],
      opacity: 1 - progress * 0.4,
    };
  });

  // ---------------------------------------------------------------------------
  // Overflow menu state
  // ---------------------------------------------------------------------------
  const [showOverflow, setShowOverflow] = useState(false);

  // ---------------------------------------------------------------------------
  // In-place edit mode
  // ---------------------------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const editorRef = useRef<ReturnType<typeof useEditorBridge> | null>(null);
  const updateJournal = useUpdateJournal(api);

  // Auto-save tracking
  const editTitleRef = useRef("");
  editTitleRef.current = editTitle;
  const lastSavedRef = useRef({ title: "", content: "" });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contentVersion, setContentVersion] = useState(0);

  const handleContentChange = useCallback(() => {
    setContentVersion((v) => v + 1);
  }, []);

  // Auto-save with 2-second debounce on title or content change
  useEffect(() => {
    if (!isEditing) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      if (!editorRef.current) return;
      const html = (await editorRef.current.getHTML()) ?? "";
      const title = editTitleRef.current.trim();

      if (
        title !== lastSavedRef.current.title ||
        html !== lastSavedRef.current.content
      ) {
        updateJournal.mutate(
          { id, title, content: html },
          {
            onSuccess: () => {
              lastSavedRef.current = { title, content: html };
            },
          },
        );
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [editTitle, contentVersion, isEditing, id, updateJournal]);

  // "Done" button handler — final save + exit edit mode
  const handleDone = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const html = (await editorRef.current?.getHTML()) ?? "";
    const title = editTitleRef.current.trim();

    updateJournal.mutate(
      { id, title, content: html },
      {
        onSuccess: () => {
          lastSavedRef.current = { title, content: html };
          Keyboard.dismiss();
          setIsEditing(false);
        },
      },
    );
  }, [id, updateJournal]);

  // ---------------------------------------------------------------------------
  // Mention search sheet (edit mode)
  // ---------------------------------------------------------------------------
  const mentionSheetRef = useRef<BottomSheet>(null);

  const handleMentionBtnPress = useCallback(() => {
    mentionSheetRef.current?.snapToIndex(0);
  }, []);

  const handleMentionSelect = useCallback(
    (mention: MentionResult) => {
      mentionSheetRef.current?.close();
      const safeTitle = escapeHtml(mention.title);
      const safeId = escapeHtml(`${mention.type}:${mention.id}`);
      const mentionHtml = `<span data-type="mention" data-id="${safeId}" class="mention">${safeTitle}</span>&nbsp;`;
      editorRef.current?.injectJS(
        `document.querySelector('.ProseMirror').focus();
         document.execCommand('insertHTML', false, ${JSON.stringify(mentionHtml)});`,
      );
    },
    [],
  );

  const handleMentionSearchDismiss = useCallback(() => {
    mentionSheetRef.current?.close();
  }, []);

  // ---------------------------------------------------------------------------
  // Mention peek sheet
  // ---------------------------------------------------------------------------
  const peekSheetRef = useRef<BottomSheet>(null);
  const [peekEntity, setPeekEntity] = useState<MentionEntity | null>(null);

  const goBack = useCallback(() => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/notes");
    }
  }, [from, router]);

  // Unsaved changes prompt on back/dismiss
  const handleBack = useCallback(async () => {
    if (isEditing) {
      const html = (await editorRef.current?.getHTML()) ?? "";
      const title = editTitle.trim();
      const isDirty =
        title !== lastSavedRef.current.title ||
        html !== lastSavedRef.current.content;

      if (isDirty) {
        Alert.alert(
          "Unsaved Changes",
          "You have unsaved changes. Do you want to discard them?",
          [
            { text: "Keep Editing", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                setIsEditing(false);
                goBack();
              },
            },
          ],
        );
        return;
      }
      setIsEditing(false);
      return;
    }
    goBack();
  }, [isEditing, editTitle, goBack]);

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

  const currentRoute = `/(main)/notes/${id}`;

  const handleMentionPress = useCallback(
    async (type: string, mentionId: string, label: string) => {
      let entity: MentionEntity = {
        type: type as "goal" | "habit" | "note",
        id: mentionId,
        title: label || capitalize(type),
      };

      try {
        if (type === "goal") {
          const goal = (await queryClient.fetchQuery(
            goalQueryOptions(api, mentionId),
          )) as any;
          if (goal) {
            entity = {
              ...entity,
              title: goal.title || label,
              status: goal.status,
              priority: goal.priority,
              impact: goal.impact,
              projectName: goal.project?.name,
              createdAt: goal.createdAt,
            };
          }
        } else if (type === "habit") {
          const habit = (await queryClient.fetchQuery(
            habitQueryOptions(api, mentionId),
          )) as any;
          if (habit) {
            entity = {
              ...entity,
              title: habit.name || habit.title || label,
              frequency: habit.frequency,
              streak: habit.currentStreak ?? habit.streak ?? 0,
              createdAt: habit.createdAt,
            };
          }
        }
      } catch {
        // Use fallback label data if fetch fails
      }

      setPeekEntity(entity);
      peekSheetRef.current?.snapToIndex(0);
    },
    [queryClient],
  );

  const handleMentionNavigate = useCallback(
    (type: string, mentionId: string) => {
      const params = { from: currentRoute };
      switch (type) {
        case "goal":
          router.push({
            pathname: "/(main)/goals/[id]",
            params: { id: mentionId, ...params },
          });
          break;
        case "habit":
          router.push({
            pathname: "/(main)/habits/[id]",
            params: { id: mentionId, ...params },
          });
          break;
        case "note":
          router.push({
            pathname: "/(main)/notes/[id]",
            params: { id: mentionId, ...params },
          });
          break;
      }
    },
    [currentRoute, router],
  );

  const handleDismissPeek = useCallback(() => {
    peekSheetRef.current?.close();
    setPeekEntity(null);
  }, []);

  // Auto-enter edit mode when navigated with editing=true
  useEffect(() => {
    if (editing === "true" && note && !isEditing) {
      const n = note as any;
      setEditTitle(n.title || "");
      lastSavedRef.current = { title: n.title || "", content: n.content || "" };
      setIsEditing(true);
    }
  }, [editing, note]);

  if (isLoading || !note) return <Loading />;

  const n = note as any;

  return (
    <Animated.View style={[styles.container, entryAnimatedStyle]}>
      <SafeAreaView style={styles.container}>
      {/* --- Floating minimal header --- */}
      <Animated.View style={[styles.header, headerOpacity, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={22} color={colors.text.primary} />
        </Pressable>

        <View style={styles.headerSpacer} />

        {isEditing ? (
          <Pressable
            onPress={handleDone}
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              setEditTitle(n.title || "");
              lastSavedRef.current = {
                title: n.title || "",
                content: n.content || "",
              };
              setIsEditing(true);
            }}
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Edit3 size={22} color={colors.text.primary} />
          </Pressable>
        )}

        <Pressable
          onPress={() => setShowOverflow(!showOverflow)}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreHorizontal size={22} color={colors.text.primary} />
        </Pressable>
      </Animated.View>

      {/* --- Overflow dropdown --- */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View style={[styles.overflowMenu, { top: insets.top + 50 }]}>
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                handleDelete();
              }}
            >
              <Trash2 size={16} color={colors.feedback.error} />
              <Text style={styles.overflowItemTextDestructive}>
                Delete Note
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* --- Content area: reader pager or in-place editor --- */}
      {isEditing ? (
        <Animated.View
          key="editor"
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1 }}
        >
          {/* Editable title */}
          <View style={[styles.editTitleContainer, { paddingTop: insets.top + 52 }]}>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={styles.editableTitle}
              placeholder="Untitled"
              placeholderTextColor={colors.text.muted}
              multiline
              autoFocus
            />
          </View>

          {/* Rich text editor */}
          <View style={{ flex: 1 }}>
            <InPlaceEditor
              content={n.content || ""}
              editorRef={editorRef}
              onContentChange={handleContentChange}
              onMentionPress={handleMentionBtnPress}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View style={[{ flex: 1 }, dismissAnimatedStyle]}>
          <NotePager
            currentId={id}
            filterProjectId={filterProjectId}
            onToggleHeader={toggleHeader}
            onMentionPress={handleMentionPress}
            dismissTranslateY={dismissTranslateY}
            headerVisible={headerVisible}
            onDismiss={goBack}
            scrollEnabled={!isEditing}
          />
        </Animated.View>
      )}

      {/* --- Mention peek bottom sheet --- */}
      <MentionPeekSheet
        ref={peekSheetRef}
        entity={peekEntity}
        onDismiss={handleDismissPeek}
        onNavigate={handleMentionNavigate}
      />

      {/* --- Mention search sheet (edit mode) --- */}
      <MentionSearchSheet
        ref={mentionSheetRef}
        onSelect={handleMentionSelect}
        onDismiss={handleMentionSearchDismiss}
      />
    </SafeAreaView>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  // Header
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  headerBtn: {
    padding: 8,
  },
  headerSpacer: {
    flex: 1,
  },
  // Overflow
  overflowBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  overflowMenu: {
    position: "absolute",
    right: 16,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 6,
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  overflowItemTextDestructive: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.feedback.error,
  },
  // Done button
  doneText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accent.indigo,
  },
  // In-place edit mode
  editTitleContainer: {
    paddingHorizontal: 24,
  },
  editableTitle: {
    ...readerTypography.title,
    color: colors.text.primary,
    marginBottom: 12,
    padding: 0,
  },
});
