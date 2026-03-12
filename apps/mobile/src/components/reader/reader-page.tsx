import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  journalQueryOptions,
  goalQueryOptions,
  habitQueryOptions,
} from "@mindtab/core";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  runOnJS,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";
import { readerTypography } from "~/styles/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReaderNote = {
  id: string;
  title?: string;
  content?: string;
  updatedAt?: string;
  createdAt?: string;
  type?: string;
  project?: { name?: string };
};

type ReaderPageProps = {
  note: ReaderNote;
  onToggleHeader: () => void;
  onMentionPress: (type: string, id: string, label: string) => void;
  dismissTranslateY: SharedValue<number>;
  headerVisible: SharedValue<number>;
  onDismiss: () => void;
};

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
      padding: 0;
      margin: 0 auto;
      max-width: 640px;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    h2 { font-size: 24px; font-weight: 600; line-height: 1.3; color: #fafafa; margin: 24px 0 12px; }
    h3 { font-size: 20px; font-weight: 600; line-height: 1.4; color: #fafafa; margin: 20px 0 10px; }
    p { margin: 0 0 20px; }
    strong, b { font-weight: 600; color: #fafafa; }
    a { color: #818cf8; text-decoration: none; }
    code { font-family: 'SF Mono', 'Roboto Mono', monospace; font-size: 15px; line-height: 1.5; color: #a3e635; background: #1c1c1c; padding: 2px 6px; border-radius: 4px; }
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
      line-height: 1.4;
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
    function sendHeight() {
      var h = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'resize', height: h }));
    }
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

    document.addEventListener('click', function(e) {
      if (e.target === document.body || e.target.tagName === 'P' || e.target.tagName === 'DIV') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggle-header' }));
      }
    });

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
// Component — self-contained reader page with its own WebView
// ---------------------------------------------------------------------------

export function ReaderPage({
  note,
  onToggleHeader,
  onMentionPress,
  dismissTranslateY,
  headerVisible,
  onDismiss,
}: ReaderPageProps) {
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [webViewHeight, setWebViewHeight] = useState(400);
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);

  // Pull-to-dismiss + header show/hide via scroll
  const prevScrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;

      // Drive dismiss animation when overscrolling at top
      if (y < 0) {
        dismissTranslateY.value = Math.abs(y);
      } else if (dismissTranslateY.value !== 0) {
        dismissTranslateY.value = 0;
      }

      // Header show/hide
      const delta = y - prevScrollY.value;
      if (y > 50 && delta > 5) {
        headerVisible.value = 0;
      } else if (delta < -5) {
        headerVisible.value = 1;
      }
      prevScrollY.value = y;
    },
    onEndDrag: (event) => {
      if (event.contentOffset.y < -80) {
        runOnJS(onDismiss)();
      }
    },
  });

  const noteType = note.type;
  const projectName = note.project?.name;

  // Fetch mention metadata and inject back into WebView
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

      webViewRef.current?.injectJavaScript(
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
          onToggleHeader();
        } else if (data.type === "mention-click") {
          onMentionPress(data.resourceType, data.id, data.label ?? "");
        } else if (data.type === "request-mention-data") {
          handleMentionDataRequest(data.ids);
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [onToggleHeader, onMentionPress, handleMentionDataRequest],
  );

  return (
    <Animated.ScrollView
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Title + meta */}
      <Pressable onPress={onToggleHeader}>
        <Text style={styles.title}>{note.title || "Untitled"}</Text>

        <View style={styles.metaRow}>
          {note.updatedAt && (
            <Text style={styles.metaText}>{formatDate(note.updatedAt)}</Text>
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
      </Pressable>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Note body via WebView */}
      <WebView
        ref={webViewRef}
        source={{ html: buildReaderHtml(note.content || "") }}
        style={{
          width: screenWidth - 40,
          height: webViewHeight,
          backgroundColor: "transparent",
          opacity: webViewReady ? 1 : 0,
        }}
        scrollEnabled={false}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => setWebViewReady(true)}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </Animated.ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 80,
  },
  title: {
    ...readerTypography.title,
    color: colors.text.primary,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  metaText: {
    ...readerTypography.meta,
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
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 20,
  },
});
