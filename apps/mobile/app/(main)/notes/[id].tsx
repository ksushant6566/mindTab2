import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  Platform,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  journalQueryOptions,
  journalsQueryOptions,
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
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import BottomSheet from "@gorhom/bottom-sheet";
import { MentionPeekSheet } from "~/components/reader/mention-peek-sheet";
import { springs } from "~/lib/animations";
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(s: string | undefined | null): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// WebView HTML builder with immersive reader CSS
// ---------------------------------------------------------------------------

function buildReaderHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 18px;
      line-height: 1.75;
      color: #e5e5e5;
      background-color: #0a0a0a;
      padding: 0 24px;
      margin: 0 auto;
      max-width: 640px;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    h2 { font-size: 24px; font-weight: 600; line-height: 1.35; color: #fafafa; margin: 24px 0 12px; }
    h3 { font-size: 20px; font-weight: 600; line-height: 1.4; color: #fafafa; margin: 20px 0 10px; }
    p { margin: 0 0 20px; }
    strong, b { font-weight: 600; color: #fafafa; }
    a { color: #818cf8; text-decoration: none; }
    code { font-family: 'SF Mono', 'Roboto Mono', monospace; font-size: 15px; color: #a3e635; background: #1c1c1c; padding: 2px 6px; border-radius: 4px; }
    pre { background: #1c1c1c; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { padding: 0; background: none; }
    blockquote { border-left: 3px solid #262626; padding-left: 16px; margin: 16px 0; color: #a3a3a3; font-style: italic; }
    img { max-width: 100%; border-radius: 8px; }
    hr { border: none; border-top: 1px solid #1a1a1a; margin: 24px 0; }
    ul, ol { padding-left: 24px; }
    li { margin: 4px 0; }

    /* @mention inline cards */
    .mention-card,
    span[data-type="mention"],
    .mention {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      background: #141414;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 8px 12px;
      margin: 4px 0;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 500;
      color: #fafafa;
    }
    .mention-card:active,
    span[data-type="mention"]:active,
    .mention:active { opacity: 0.7; }
    .mention-top { display: flex; align-items: center; gap: 6px; }
    .mention-icon { font-size: 14px; }
    .mention-meta { font-size: 12px; color: #a3a3a3; line-height: 1.3; }
  </style>
</head>
<body>
  ${content}
  <div style="height: 40px;"></div>
  <script>
    // Communicate content height to React Native for auto-sizing
    function sendHeight() {
      var h = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'resize', height: h }));
    }
    // Step 3.3: Inject type icons into mention cards
    function addMentionIcons() {
      document.querySelectorAll('[data-type="mention"], .mention, .mention-card').forEach(function(el) {
        if (el.querySelector('.mention-icon')) return;
        var rawId = el.getAttribute('data-id') || '';
        var type = rawId.split(':')[0];
        var icon = type === 'goal' ? '🎯' : type === 'habit' ? '🔄' : type === 'note' ? '📝' : '';
        var labelText = el.textContent;
        el.textContent = '';
        var topRow = document.createElement('span');
        topRow.className = 'mention-top';
        if (icon) {
          var iconSpan = document.createElement('span');
          iconSpan.className = 'mention-icon';
          iconSpan.textContent = icon;
          topRow.appendChild(iconSpan);
        }
        var labelSpan = document.createElement('span');
        labelSpan.textContent = labelText;
        topRow.appendChild(labelSpan);
        el.appendChild(topRow);
      });
    }

    // Step 3.4/3.5: Request entity metadata from React Native
    function requestMentionData() {
      var ids = [];
      document.querySelectorAll('[data-type="mention"], .mention, .mention-card').forEach(function(el) {
        var rawId = el.getAttribute('data-id') || '';
        if (rawId) ids.push(rawId);
      });
      if (ids.length > 0) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request-mention-data', ids: ids }));
      }
    }

    // Called from React Native with enriched entity data
    window.updateMentionCards = function(data) {
      document.querySelectorAll('[data-type="mention"], .mention, .mention-card').forEach(function(el) {
        var rawId = el.getAttribute('data-id') || '';
        var d = data[rawId];
        if (!d || el.querySelector('.mention-meta')) return;
        var parts = [];
        if (d.status) parts.push(d.status.replace(/_/g, ' '));
        if (d.priority) parts.push(d.priority.toUpperCase());
        if (d.streak !== undefined) parts.push('🔥 ' + d.streak + 'd');
        if (d.projectName) parts.push('📁 ' + d.projectName);
        if (parts.length > 0) {
          var meta = document.createElement('div');
          meta.className = 'mention-meta';
          meta.textContent = parts.join(' · ');
          el.appendChild(meta);
        }
      });
      sendHeight();
    };

    window.addEventListener('load', function() {
      setTimeout(function() { sendHeight(); addMentionIcons(); requestMentionData(); }, 100);
    });
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sendHeight);

    // Tap to toggle header
    document.addEventListener('click', function(e) {
      // Only fire on body/text taps, not on mentions or links
      if (e.target === document.body || e.target.tagName === 'P' || e.target.tagName === 'DIV') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggle-header' }));
      }
    });

    // Mention click handler
    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el !== document.body) {
        if (el.getAttribute('data-type') === 'mention' || el.classList.contains('mention') || el.classList.contains('mention-card')) {
          e.preventDefault();
          var rawId = el.getAttribute('data-id') || '';
          var idColonIdx = rawId.indexOf(':');
          var type = idColonIdx > 0 ? rawId.substring(0, idColonIdx) : 'unknown';
          var id = idColonIdx > 0 ? rawId.substring(idColonIdx + 1) : rawId;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mention-click',
            resourceType: type,
            id: id,
            label: el.textContent || ''
          }));
          return;
        }
        el = el.parentElement;
      }
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
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
};

// ---------------------------------------------------------------------------
// In-place editor sub-component (hooks must be called unconditionally)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

export default function NoteDetailScreen() {
  const { id, from, projectId: filterProjectId, editing } = useLocalSearchParams<{
    id: string;
    from?: string;
    projectId?: string;
    editing?: string;
  }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const deleteJournal = useDeleteJournal(api);

  // ---------------------------------------------------------------------------
  // Swipe-between-notes navigation
  // ---------------------------------------------------------------------------
  const { data: allNotes } = useQuery(
    journalsQueryOptions(api, {
      projectId: filterProjectId || undefined,
    }),
  );

  const noteIds = useMemo(() => {
    if (!allNotes) return [];
    const sorted = [...allNotes].sort((a, b) => {
      const aDate = a.updatedAt ?? a.createdAt ?? "";
      const bDate = b.updatedAt ?? b.createdAt ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    return sorted.map((n: any) => n.id as string);
  }, [allNotes]);

  const currentIndex = noteIds.indexOf(id);

  const swipeTranslateX = useSharedValue(0);
  const swipeOpacity = useSharedValue(1);
  const prevScrollY = useRef(0);
  const currentScrollY = useRef(0);

  const SWIPE_THRESHOLD = 80;

  const navigateToNote = useCallback(
    (noteId: string) => {
      router.replace({
        pathname: "/(main)/notes/[id]",
        params: {
          id: noteId,
          from: from ?? "",
          ...(filterProjectId ? { projectId: filterProjectId } : {}),
        },
      });
    },
    [router, from, filterProjectId],
  );

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-5, 5])
    .onUpdate((event) => {
      // Provide parallax feedback during swipe
      swipeTranslateX.value = event.translationX * 0.3;
    })
    .onEnd((event) => {
      if (
        event.translationX < -SWIPE_THRESHOLD &&
        currentIndex >= 0 &&
        currentIndex < noteIds.length - 1
      ) {
        // Swipe left -> next note
        swipeOpacity.value = withTiming(0, { duration: 150 });
        swipeTranslateX.value = withTiming(-40, { duration: 150 }, () => {
          runOnJS(navigateToNote)(noteIds[currentIndex + 1]!);
        });
        return;
      }

      if (
        event.translationX > SWIPE_THRESHOLD &&
        currentIndex > 0
      ) {
        // Swipe right -> previous note
        swipeOpacity.value = withTiming(0, { duration: 150 });
        swipeTranslateX.value = withTiming(40, { duration: 150 }, () => {
          runOnJS(navigateToNote)(noteIds[currentIndex - 1]!);
        });
        return;
      }

      // Snap back – didn't pass threshold
      swipeTranslateX.value = withSpring(0, springs.snappy);
      swipeOpacity.value = withTiming(1, { duration: 100 });
    });

  const swipeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeTranslateX.value }],
    opacity: swipeOpacity.value,
  }));

  // WebView auto-height & ref for metadata injection
  const [webViewHeight, setWebViewHeight] = useState(400);
  const readerWebViewRef = useRef<WebView>(null);

  const headerVisible = useSharedValue(1);
  const headerOpacity = useAnimatedStyle(() => {
    return {
      opacity: withTiming(headerVisible.value, { duration: 200 }),
      pointerEvents: headerVisible.value > 0.5 ? "auto" as const : "none" as const,
    };
  });

  const toggleHeader = useCallback(() => {
    headerVisible.value = headerVisible.value > 0.5 ? 0 : 1;
  }, [headerVisible]);

  // Overflow menu state
  const [showOverflow, setShowOverflow] = useState(false);

  // In-place edit mode
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

  // Mention search sheet (Step 1.6)
  const mentionSheetRef = useRef<BottomSheet>(null);

  const handleMentionBtnPress = useCallback(() => {
    mentionSheetRef.current?.snapToIndex(0);
  }, []);

  const handleMentionSelect = useCallback(
    (mention: MentionResult) => {
      mentionSheetRef.current?.close();
      // Insert mention span into editor via injectJS (HTML-escaped to prevent XSS)
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

  // Mention peek sheet
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

  // Step 1.5: Unsaved changes prompt on back/dismiss
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
      // Build base entity, then enrich with full data
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

  // Step 3.4/3.5: Fetch mention metadata and inject into reader WebView
  const handleMentionDataRequest = useCallback(
    async (ids: string[]) => {
      const result: Record<string, any> = {};

      await Promise.all(
        ids.map(async (rawId) => {
          const colonIdx = rawId.indexOf(":");
          if (colonIdx <= 0) return;
          const type = rawId.substring(0, colonIdx);
          const entityId = rawId.substring(colonIdx + 1);
          try {
            if (type === "goal") {
              const goal = (await queryClient.fetchQuery(
                goalQueryOptions(api, entityId),
              )) as any;
              if (goal) {
                result[rawId] = {
                  status: goal.status,
                  priority: goal.priority,
                  projectName: goal.project?.name,
                };
              }
            } else if (type === "habit") {
              const habit = (await queryClient.fetchQuery(
                habitQueryOptions(api, entityId),
              )) as any;
              if (habit) {
                result[rawId] = {
                  streak: habit.currentStreak ?? habit.streak ?? 0,
                  frequency: habit.frequency,
                };
              }
            } else if (type === "note") {
              const journal = (await queryClient.fetchQuery(
                journalQueryOptions(api, entityId),
              )) as any;
              if (journal) {
                result[rawId] = {
                  projectName: journal.project?.name,
                };
              }
            }
          } catch {
            // skip failed fetches
          }
        }),
      );

      // Inject enriched data into the reader WebView
      readerWebViewRef.current?.injectJavaScript(
        `window.updateMentionCards(${JSON.stringify(result)}); true;`,
      );
    },
    [queryClient],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "resize" && typeof data.height === "number") {
          setWebViewHeight(data.height);
        } else if (data.type === "toggle-header") {
          toggleHeader();
        } else if (data.type === "mention-click") {
          handleMentionPress(data.resourceType, data.id, data.label ?? "");
        } else if (data.type === "request-mention-data") {
          handleMentionDataRequest(data.ids);
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [handleMentionPress, handleMentionDataRequest],
  );

  const handleDismissPeek = useCallback(() => {
    peekSheetRef.current?.close();
    setPeekEntity(null);
  }, []);

  const handleScroll = useCallback((event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    currentScrollY.current = currentY;
    if (currentY > prevScrollY.current + 5) {
      headerVisible.value = 0;
    } else if (currentY < prevScrollY.current - 5) {
      headerVisible.value = 1;
    }
    prevScrollY.current = currentY;
  }, [headerVisible]);

  const pinchDismissed = useRef(false);
  const handlePinchDismiss = useCallback(() => {
    if (pinchDismissed.current) return;
    pinchDismissed.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goBack();
  }, [goBack]);

  const dismissPan = Gesture.Pan()
    .activeOffsetY([10, 1000])
    .failOffsetX([-20, 20])
    .onEnd((event) => {
      if (currentScrollY.current <= 0 && event.translationY > 100 && event.velocityY > 200) {
        runOnJS(handleBack)();
      }
    });

  const dismissPinch = Gesture.Pinch()
    .onUpdate((event) => {
      if (event.scale < 0.75) {
        runOnJS(handlePinchDismiss)();
      }
    });

  const dismissGesture = Gesture.Race(dismissPan, dismissPinch);

  const composedGesture = Gesture.Simultaneous(swipeGesture, dismissGesture);

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
  const noteType: string | undefined = n.type;
  const projectName: string | undefined = n.project?.name;

  return (
    <SafeAreaView style={styles.container}>
      {/* --- Floating minimal header --- */}
      <Animated.View style={[styles.header, headerOpacity]}>
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
              const n = note as any;
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
          <View style={styles.overflowMenu}>
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

      {/* --- Content area: reader or in-place editor --- */}
      {isEditing ? (
        <Animated.View
          key="editor"
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1 }}
        >
          {/* Editable title */}
          <View style={styles.editTitleContainer}>
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
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[{ flex: 1 }, swipeAnimatedStyle]}>
            <Animated.ScrollView
              onScroll={handleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Title */}
              <Text style={styles.title}>{n.title || "Untitled"}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {n.updatedAt && (
                  <Text style={styles.metaText}>{formatDate(n.updatedAt)}</Text>
                )}
                {projectName && (
                  <Text style={styles.metaText}>
                    {"  \u00B7  "}
                    {projectName}
                  </Text>
                )}
                {noteType && (
                  <View
                    style={[
                      styles.typeBadge,
                      {
                        backgroundColor:
                          (colors.noteType as Record<string, string>)[noteType] ??
                          colors.accent.indigo,
                      },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {capitalize(noteType)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Note body via WebView */}
              <WebView
                ref={readerWebViewRef}
                source={{ html: buildReaderHtml(n.content || "") }}
                style={{
                  width: screenWidth - 48,
                  height: webViewHeight,
                  backgroundColor: colors.bg.primary,
                }}
                scrollEnabled={false}
                onMessage={handleWebViewMessage}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
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
    paddingTop: Platform.OS === "ios" ? 56 : 16,
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
    top: Platform.OS === "ios" ? 100 : 60,
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
  // Scroll content
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 110 : 70,
    paddingBottom: 80,
  },
  // Title
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text.primary,
    lineHeight: 36,
    marginBottom: 12,
  },
  // Meta
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  typeBadge: {
    marginLeft: 8,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    opacity: 0.85,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.primary,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 20,
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
    paddingTop: Platform.OS === "ios" ? 110 : 70,
  },
  editableTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text.primary,
    lineHeight: 36,
    marginBottom: 12,
    padding: 0,
  },
});
