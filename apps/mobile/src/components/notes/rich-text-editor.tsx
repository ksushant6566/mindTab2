import { useState, useMemo, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  StyleSheet as RNStyleSheet,
} from "react-native";
import {
  useEditorBridge,
  RichText,
  Toolbar,
  TenTapStartKit,
} from "@10play/tentap-editor";
import BridgeExtension from "@10play/tentap-editor/lib/module/bridges/base";
// @ts-expect-error – internal util, no public typings
import { getInjectedJSBeforeContentLoad } from "@10play/tentap-editor/lib/module/RichText/utils";
import Animated, { SlideInDown } from "react-native-reanimated";
import { colors } from "~/styles/colors";
import { springs } from "~/lib/animations";

const darkThemeCSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: ${colors.bg.primary} !important;
    color: #e5e5e5 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 18px;
    line-height: 1.75;
    padding: 0 20px;
    margin: 0;
    -webkit-font-smoothing: antialiased;
    -webkit-text-size-adjust: 100%;
  }
  .ProseMirror {
    background-color: ${colors.bg.primary} !important;
    color: #e5e5e5 !important;
    min-height: 100%;
    outline: none;
  }
  .ProseMirror p { margin: 0 0 20px; }
  .ProseMirror h2 { font-size: 24px; font-weight: 600; line-height: 1.3; color: #fafafa; margin: 24px 0 12px; }
  .ProseMirror h3 { font-size: 20px; font-weight: 600; line-height: 1.4; color: #fafafa; margin: 20px 0 10px; }
  .ProseMirror strong, .ProseMirror b { font-weight: 600; color: #fafafa; }
  .ProseMirror a { color: ${colors.accent.indigo}; text-decoration: none; }
  .ProseMirror blockquote {
    border-left: 3px solid ${colors.border.default};
    padding-left: 16px;
    margin: 16px 0;
    color: ${colors.text.secondary};
    font-style: italic;
  }
  .ProseMirror code {
    font-family: 'SF Mono', 'Roboto Mono', monospace;
    font-size: 15px;
    line-height: 1.5;
    color: #a3e635;
    background: ${colors.bg.surface};
    padding: 2px 6px;
    border-radius: 4px;
  }
  .ProseMirror pre {
    background: ${colors.bg.surface};
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
  }
  .ProseMirror pre code { padding: 0; background: none; }
  .ProseMirror img { max-width: 100%; border-radius: 8px; }
  .ProseMirror hr { border: none; border-top: 1px solid ${colors.border.subtle}; margin: 24px 0; }
  .ProseMirror ul, .ProseMirror ol { padding-left: 24px; }
  .ProseMirror li { margin: 4px 0; }
  .ProseMirror span[data-type="mention"],
  .ProseMirror .mention {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: ${colors.bg.elevated};
    border: 1px solid ${colors.border.default};
    border-radius: 8px;
    padding: 4px 10px;
    margin: 2px 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.4;
    color: #fafafa;
  }
`;

const DarkThemeBridge = new BridgeExtension({
  forceName: "dark-theme",
  extendCSS: darkThemeCSS,
});

export function useRichEditor(opts?: {
  initialContent?: string;
  editable?: boolean;
  onChange?: () => void;
}) {
  const editor = useEditorBridge({
    autofocus: opts?.editable !== false,
    avoidIosKeyboard: true,
    initialContent: opts?.initialContent || "",
    editable: opts?.editable !== false,
    onChange: opts?.onChange,
    bridgeExtensions: [...TenTapStartKit, DarkThemeBridge],
    theme: {
      toolbar: {
        toolbarBody: {
          backgroundColor: colors.bg.elevated,
          borderTopColor: colors.border.default,
          borderTopWidth: 1,
        },
        icon: {
          tintColor: colors.text.primary,
        },
        iconActive: {
          tintColor: colors.text.primary,
        },
        iconDisabled: {
          tintColor: colors.text.muted,
        },
      },
      webview: {
        backgroundColor: colors.bg.primary,
      },
      webviewContainer: {
        backgroundColor: colors.bg.primary,
      },
      colorKeyboard: {
        keyboardRootColor: colors.bg.elevated,
      },
    },
  });

  return editor;
}

export function RichTextEditorView({
  editor,
  showToolbar = true,
  onMentionPress,
  onReady,
}: {
  editor: ReturnType<typeof useEditorBridge>;
  showToolbar?: boolean;
  onMentionPress?: () => void;
  onReady?: () => void;
}) {
  const [ready, setReady] = useState(false);

  // On iOS, tentap-editor remounts the WebView via a key change after the
  // first load (RichText.tsx L140-141, workaround for react-native-webview
  // #3578). Our onLoad fires on the FIRST WebView which is immediately
  // destroyed — the SECOND WebView appears empty. We must wait for the
  // second onLoad (the real one) before revealing.
  const loadCountRef = useRef(0);
  const loadThreshold = Platform.OS === "ios" ? 2 : 1;

  // The library injects extendCSS via injectedJavaScript (post-load) — the
  // base HTML has no dark styles. Prepend dark CSS injection to the library's
  // before-content-loaded setup so the very first paint is already dark.
  const beforeContentLoaded = useMemo(() => {
    const earlyCSS =
      `(function(){var s=document.createElement('style');` +
      `s.setAttribute('data-tag','dark-theme');` +
      `s.textContent=${JSON.stringify(darkThemeCSS)};` +
      `(document.head||document.documentElement).appendChild(s);` +
      `})();`;
    return earlyCSS + getInjectedJSBeforeContentLoad(editor);
  }, [editor]);

  return (
    <>
      <RichText
        editor={editor}
        injectedJavaScriptBeforeContentLoaded={beforeContentLoaded}
        onLoad={() => {
          loadCountRef.current += 1;
          if (loadCountRef.current >= loadThreshold) {
            setReady(true);
            onReady?.();
          }
        }}
        style={{ flex: 1, backgroundColor: colors.bg.primary, opacity: ready ? 1 : 0 }}
      />
      {showToolbar && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        >
          <Animated.View
            entering={SlideInDown.springify()
              .damping(springs.snappy.damping)
              .stiffness(springs.snappy.stiffness)
              .mass(springs.snappy.mass)}
          >
            <View style={toolbarStyles.toolbarRow}>
              {onMentionPress && (
                <Pressable
                  onPress={onMentionPress}
                  style={toolbarStyles.mentionBtn}
                >
                  <Text style={toolbarStyles.mentionBtnText}>@</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }}>
                <Toolbar editor={editor} />
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const toolbarStyles = RNStyleSheet.create({
  toolbarRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  mentionBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg.elevated,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    borderRightWidth: 1,
    borderRightColor: colors.border.default,
  },
  mentionBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.accent.indigo,
  },
});
