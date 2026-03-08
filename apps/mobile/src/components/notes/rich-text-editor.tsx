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
import Animated, { SlideInDown } from "react-native-reanimated";
import { colors } from "~/styles/colors";
import { springs } from "~/lib/animations";

const darkThemeCSS = `
  * { box-sizing: border-box; }
  body {
    background-color: ${colors.bg.primary} !important;
    color: ${colors.text.primary} !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    padding: 0 16px;
    margin: 0;
  }
  .ProseMirror {
    background-color: ${colors.bg.primary} !important;
    color: ${colors.text.primary} !important;
    min-height: 100%;
    outline: none;
  }
  .ProseMirror p { margin: 0.5em 0; }
  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
    color: ${colors.text.primary} !important;
    margin: 0.8em 0 0.4em;
  }
  .ProseMirror a { color: #60a5fa; }
  .ProseMirror blockquote {
    border-left: 3px solid ${colors.border.default};
    padding-left: 12px;
    color: ${colors.text.muted};
    margin: 0.5em 0;
  }
  .ProseMirror code {
    background-color: ${colors.bg.surface};
    color: ${colors.text.primary};
    padding: 2px 4px;
    border-radius: 4px;
    font-size: 14px;
  }
  .ProseMirror pre {
    background-color: ${colors.bg.surface};
    color: ${colors.text.primary};
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
  }
  .ProseMirror ul, .ProseMirror ol { padding-left: 24px; }
  .ProseMirror li { margin: 0.25em 0; }
  .ProseMirror hr { border: none; border-top: 1px solid ${colors.border.default}; margin: 1em 0; }
  .ProseMirror span[data-type="mention"],
  .ProseMirror .mention {
    background-color: #1e3a5f;
    color: #60a5fa;
    border-radius: 4px;
    padding: 2px 6px;
    font-weight: 500;
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
}: {
  editor: ReturnType<typeof useEditorBridge>;
  showToolbar?: boolean;
  onMentionPress?: () => void;
}) {
  return (
    <>
      <RichText
        editor={editor}
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
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
