import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function renderAssistantContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    // Code block detection: lines starting with 4 spaces or inside ``` blocks are handled inline
    // We do a simple inline pass for **bold** and `code`
    const segments = parseInlineMarkdown(line);
    nodes.push(
      <Text key={`line-${lineIndex}`} style={styles.assistantText}>
        {segments}
      </Text>
    );
    if (lineIndex < lines.length - 1) {
      nodes.push(<Text key={`br-${lineIndex}`}>{"\n"}</Text>);
    }
  });

  return <>{nodes}</>;
}

function parseInlineMarkdown(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, `code`, or plain text
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const before = line.slice(lastIndex, match.index);
    if (before) {
      parts.push(<Text key={`plain-${lastIndex}`}>{before}</Text>);
    }

    const token = match[1];
    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2);
      parts.push(
        <Text key={`bold-${match.index}`} style={styles.boldText}>
          {inner}
        </Text>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      parts.push(
        <Text key={`code-${match.index}`} style={styles.inlineCode}>
          {inner}
        </Text>
      );
    }

    lastIndex = match.index + token.length;
  }

  const remaining = line.slice(lastIndex);
  if (remaining) {
    parts.push(<Text key={`plain-end-${lastIndex}`}>{remaining}</Text>);
  }

  return parts;
}

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.cursor, { opacity }]}>
      <Text style={styles.cursorText}>|</Text>
    </Animated.View>
  );
}

function ThreeDotsLoader() {
  return (
    <View style={styles.dotsContainer}>
      <View style={[styles.dot, styles.dot1]} />
      <View style={[styles.dot, styles.dot2]} />
      <View style={[styles.dot, styles.dot3]} />
    </View>
  );
}

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  if (role === "user") {
    return (
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{content}</Text>
      </View>
    );
  }

  // Assistant bubble
  if (isStreaming && content === "") {
    return (
      <View style={styles.assistantBubble}>
        <ThreeDotsLoader />
      </View>
    );
  }

  return (
    <View style={styles.assistantBubble}>
      <View style={styles.assistantContentRow}>
        <Text style={styles.assistantText}>
          {renderAssistantContent(content)}
        </Text>
        {isStreaming && <BlinkingCursor />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    color: "#0a0a0a",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    backgroundColor: "#141414",
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantContentRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  assistantText: {
    color: "#e0e0e0",
    fontSize: 14,
    lineHeight: 22,
    flexShrink: 1,
  },
  boldText: {
    fontWeight: "700",
    color: "#e0e0e0",
  },
  inlineCode: {
    fontFamily: "monospace",
    backgroundColor: "#1c1c1c",
    color: "#d0d0d0",
    fontSize: 13,
  },
  cursor: {
    marginLeft: 2,
    marginBottom: 1,
  },
  cursorText: {
    color: "#888888",
    fontSize: 14,
    lineHeight: 22,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dot1: {
    backgroundColor: "#555555",
  },
  dot2: {
    backgroundColor: "#888888",
  },
  dot3: {
    backgroundColor: "#bbbbbb",
  },
});
