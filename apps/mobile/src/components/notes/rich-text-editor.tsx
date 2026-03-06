import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useEditorBridge, RichText, Toolbar } from "@10play/tentap-editor";
import { useEffect } from "react";
import { colors } from "~/styles/colors";

type RichTextEditorProps = {
  initialContent?: string;
  editable?: boolean;
  onReady?: (editor: ReturnType<typeof useEditorBridge>) => void;
  showToolbar?: boolean;
};

export function useRichEditor(opts?: {
  initialContent?: string;
  editable?: boolean;
}) {
  const editor = useEditorBridge({
    autofocus: opts?.editable !== false,
    avoidIosKeyboard: true,
    initialContent: opts?.initialContent || "",
    editable: opts?.editable !== false,
    theme: {
      toolbar: {
        toolbarBody: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        icon: {
          tintColor: colors.foreground,
        },
        iconActive: {
          tintColor: colors.primary,
        },
        iconDisabled: {
          tintColor: colors.mutedForeground,
        },
      },
      webview: {
        backgroundColor: colors.background,
      },
      webviewContainer: {
        backgroundColor: colors.background,
      },
      colorKeyboard: {
        keyboardRootColor: colors.card,
      },
    },
  });

  return editor;
}

export function RichTextEditorView({
  editor,
  showToolbar = true,
}: {
  editor: ReturnType<typeof useEditorBridge>;
  showToolbar?: boolean;
}) {
  return (
    <>
      <RichText
        editor={editor}
        style={{ flex: 1, backgroundColor: colors.background }}
      />
      {showToolbar && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        >
          <Toolbar editor={editor} />
        </KeyboardAvoidingView>
      )}
    </>
  );
}
