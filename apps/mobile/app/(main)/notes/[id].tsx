import { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  journalQueryOptions,
  journalsQueryOptions,
  useDeleteJournal,
} from "@mindtab/core";
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
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import BottomSheet from "@gorhom/bottom-sheet";
import { MentionPeekSheet } from "~/components/reader/mention-peek-sheet";
import { springs } from "~/lib/animations";

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
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 18px;
      line-height: 1.75;
      color: #e5e5e5;
      background-color: #0a0a0a;
      padding: 0 24px;
      margin: 0;
      max-width: 100%;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    h2 { font-size: 24px; font-weight: 600; line-height: 1.35; color: #fafafa; margin: 24px 0 12px; }
    h3 { font-size: 20px; font-weight: 600; line-height: 1.4; color: #fafafa; margin: 20px 0 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    p { margin: 0 0 16px; }
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
      align-items: center;
      gap: 6px;
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
    window.addEventListener('load', function() { setTimeout(sendHeight, 100); });
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sendHeight);

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
};

export default function NoteDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { data: note, isLoading } = useQuery(journalQueryOptions(api, id));
  const deleteJournal = useDeleteJournal(api);

  // ---------------------------------------------------------------------------
  // Swipe-between-notes navigation
  // ---------------------------------------------------------------------------
  const { data: allNotes } = useQuery(journalsQueryOptions(api));

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

  const SWIPE_THRESHOLD = 80;

  const navigateToNote = useCallback(
    (noteId: string) => {
      router.replace({
        pathname: "/(main)/notes/[id]",
        params: { id: noteId, from: from ?? "" },
      });
    },
    [router, from],
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

  // WebView auto-height
  const [webViewHeight, setWebViewHeight] = useState(400);

  // Scroll-driven header fade
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const headerOpacity = useAnimatedStyle(() => ({
    opacity:
      scrollY.value > 50
        ? withTiming(0, { duration: 200 })
        : withTiming(1, { duration: 150 }),
  }));

  // Overflow menu state
  const [showOverflow, setShowOverflow] = useState(false);

  // Mention peek sheet
  const peekSheetRef = useRef<BottomSheet>(null);
  const [peekEntity, setPeekEntity] = useState<MentionEntity | null>(null);

  const goBack = () => {
    if (from) {
      router.replace(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/notes");
    }
  };

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
    (type: string, mentionId: string, label: string) => {
      // Open the peek sheet with entity info
      setPeekEntity({
        type: type as "goal" | "habit" | "note",
        id: mentionId,
        title: label || capitalize(type),
      });
      peekSheetRef.current?.snapToIndex(0);
    },
    [],
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
        case "journal":
          router.push({
            pathname: "/(main)/notes/[id]",
            params: { id: mentionId, ...params },
          });
          break;
      }
    },
    [currentRoute, router],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "resize" && typeof data.height === "number") {
          setWebViewHeight(data.height);
        } else if (data.type === "mention-click") {
          handleMentionPress(data.resourceType, data.id, data.label ?? "");
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [handleMentionPress],
  );

  const handleDismissPeek = useCallback(() => {
    peekSheetRef.current?.close();
    setPeekEntity(null);
  }, []);

  if (isLoading || !note) return <Loading />;

  const n = note as any;
  const noteType: string | undefined = n.type;
  const projectName: string | undefined = n.project?.name;

  return (
    <SafeAreaView style={styles.container}>
      {/* --- Floating minimal header --- */}
      <Animated.View style={[styles.header, headerOpacity]}>
        <Pressable
          onPress={goBack}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={22} color={colors.text.primary} />
        </Pressable>

        <View style={styles.headerSpacer} />

        <Pressable
          onPress={() => router.push(`/(main)/notes/edit/${id}`)}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Edit3 size={22} color={colors.text.primary} />
        </Pressable>

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

      {/* --- Scrollable reader content with swipe navigation --- */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[{ flex: 1 }, swipeAnimatedStyle]}>
          <Animated.ScrollView
            onScroll={scrollHandler}
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

      {/* --- Mention peek bottom sheet --- */}
      <MentionPeekSheet
        ref={peekSheetRef}
        entity={
          peekEntity
            ? {
                type: peekEntity.type,
                id: peekEntity.id,
                title: peekEntity.title,
              }
            : null
        }
        onDismiss={handleDismissPeek}
        onNavigate={handleMentionNavigate}
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
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
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
});
