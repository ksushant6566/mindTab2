import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { colors } from "~/styles/colors";

type MarkdownContentProps = {
  content: string;
};

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "hr" };

function parseBlocks(markdown: string): Block[] {
  // Strip metadata preamble from Jina Reader output
  let cleaned = markdown;
  const mdContentIdx = cleaned.indexOf("Markdown Content:");
  if (mdContentIdx !== -1) {
    cleaned = cleaned.slice(mdContentIdx + "Markdown Content:".length);
  }

  // Remove image markdown syntax
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, "");
  // Remove standalone link-only lines like [text](url)
  cleaned = cleaned.replace(/^\[.*?\]\(.*?\)\s*$/gm, "");

  const lines = cleaned.split("\n");
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushParagraph();
      blocks.push({ type: "blockquote", text: line.slice(2).trim() });
      continue;
    }

    // Empty line — flush paragraph
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Regular text — accumulate into paragraph
    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push(before);

    const token = match[1];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <Text key={`b-${match.index}`} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <Text key={`i-${match.index}`} style={styles.italic}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <Text key={`c-${match.index}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith("[")) {
      // [text](url) — render just the text
      const linkText = token.match(/\[([^\]]+)\]/)?.[1] ?? token;
      parts.push(
        <Text key={`l-${match.index}`} style={styles.link}>
          {linkText}
        </Text>
      );
    }

    lastIndex = match.index + token.length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) parts.push(remaining);

  return parts;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h1":
            return (
              <Text key={i} style={styles.h1}>
                {block.text}
              </Text>
            );
          case "h2":
            return (
              <Text key={i} style={styles.h2}>
                {block.text}
              </Text>
            );
          case "h3":
            return (
              <Text key={i} style={styles.h3}>
                {block.text}
              </Text>
            );
          case "paragraph":
            return (
              <Text key={i} style={styles.paragraph}>
                {renderInline(block.text)}
              </Text>
            );
          case "blockquote":
            return (
              <View key={i} style={styles.blockquote}>
                <Text style={styles.blockquoteText}>
                  {renderInline(block.text)}
                </Text>
              </View>
            );
          case "hr":
            return <View key={i} style={styles.hr} />;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  h1: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
  },
  h2: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
    marginTop: 4,
  },
  h3: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 2,
  },
  paragraph: {
    color: "#b0b0b0",
    fontSize: 14,
    lineHeight: 23,
  },
  bold: {
    fontWeight: "700",
    color: "#d0d0d0",
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: "monospace",
    backgroundColor: "#1c1c1c",
    color: "#d0d0d0",
    fontSize: 13,
  },
  link: {
    color: colors.accent.indigo,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border.default,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  blockquoteText: {
    color: "#999999",
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  hr: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: 4,
  },
});
