import { useRef } from "react";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { colors } from "~/styles/colors";

type NoteContentViewProps = {
  content: string;
  onMentionPress?: (type: string, id: string) => void;
};

function buildHtml(content: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: ${colors.background};
      color: ${colors.foreground};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      padding: 0;
      -webkit-text-size-adjust: 100%;
    }
    p { margin: 0.5em 0; }
    h1, h2, h3 { color: ${colors.foreground}; margin: 0.8em 0 0.4em; }
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.1em; }
    a { color: #60a5fa; text-decoration: underline; }
    blockquote {
      border-left: 3px solid ${colors.border};
      padding-left: 12px;
      color: ${colors.mutedForeground};
      margin: 0.5em 0;
    }
    code {
      background-color: ${colors.secondary};
      color: ${colors.foreground};
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 14px;
    }
    pre {
      background-color: ${colors.secondary};
      color: ${colors.foreground};
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 0.5em 0;
    }
    pre code { background: none; padding: 0; }
    ul, ol { padding-left: 24px; }
    li { margin: 0.25em 0; }
    hr { border: none; border-top: 1px solid ${colors.border}; margin: 1em 0; }

    /* Mention styling */
    span[data-type="mention"],
    .mention {
      background-color: #1e3a5f;
      color: #60a5fa;
      border-radius: 4px;
      padding: 2px 6px;
      cursor: pointer;
      font-weight: 500;
    }
  </style>
</head>
<body>
  ${content}
  <script>
    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el !== document.body) {
        if (el.getAttribute('data-type') === 'mention' || el.classList.contains('mention')) {
          e.preventDefault();
          var rawId = el.getAttribute('data-id') || '';
          // data-id is "type:uuid" (e.g. "goal:abc-123")
          var idColonIdx = rawId.indexOf(':');
          var type = idColonIdx > 0 ? rawId.substring(0, idColonIdx) : 'unknown';
          var id = idColonIdx > 0 ? rawId.substring(idColonIdx + 1) : rawId;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mention-click',
            resourceType: type,
            id: id
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

export function NoteContentView({ content, onMentionPress }: NoteContentViewProps) {
  const webviewRef = useRef<WebView>(null);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "mention-click" && onMentionPress) {
        onMentionPress(data.resourceType, data.id);
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  return (
    <WebView
      ref={webviewRef}
      source={{ html: buildHtml(content) }}
      style={{ flex: 1, backgroundColor: colors.background }}
      scrollEnabled={true}
      onMessage={handleMessage}
      showsVerticalScrollIndicator={false}
    />
  );
}
