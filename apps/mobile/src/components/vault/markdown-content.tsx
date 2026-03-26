import React from "react";
import {
  Text,
  View,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  type TextStyle,
} from "react-native";
import { colors } from "~/styles/colors";

type MarkdownContentProps = {
  content: string;
};

// ── Block types ────────────────────────────────────────────────────────────────

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type Block =
  | { type: "heading"; level: HeadingLevel; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "code_block"; language: string; code: string }
  | { type: "unordered_list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "image"; alt: string; url: string }
  | { type: "hr" };

// ── Preamble stripping ────────────────────────────────────────────────────────

function stripPreamble(markdown: string): string {
  let text = markdown;
  const mdContentIdx = text.indexOf("Markdown Content:");
  if (mdContentIdx !== -1) {
    text = text.slice(mdContentIdx + "Markdown Content:".length);
  }
  return text;
}

// ── Block parser ───────────────────────────────────────────────────────────────

function parseBlocks(markdown: string): Block[] {
  const cleaned = stripPreamble(markdown);
  const lines = cleaned.split("\n");
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];
  let i = 0;

  const flushParagraph = () => {
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // ── Code block (fenced) ──
    if (trimmed.startsWith("```")) {
      flushParagraph();
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimEnd().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code_block", language, code: codeLines.join("\n") });
      i++; // skip closing ```
      continue;
    }

    // ── Horizontal rule ──
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ── Headings (h1-h6) ──
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length as HeadingLevel;
      blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    // ── Standalone image ──
    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      flushParagraph();
      blocks.push({ type: "image", alt: imageMatch[1], url: imageMatch[2] });
      i++;
      continue;
    }

    // ── Blockquote ──
    if (trimmed.startsWith("> ") || trimmed === ">") {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trimEnd().startsWith("> ") || lines[i].trimEnd() === ">")) {
        const qLine = lines[i].trimEnd();
        quoteLines.push(qLine === ">" ? "" : qLine.slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // ── Unordered list ──
    if (/^\s*[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trimEnd();
        if (/^\s*[-*+]\s+/.test(cur)) {
          items.push(cur.replace(/^\s*[-*+]\s+/, ""));
          i++;
        } else if (cur === "" && i + 1 < lines.length && /^\s*[-*+]\s+/.test(lines[i + 1].trimEnd())) {
          // Skip blank line between list items
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "unordered_list", items });
      continue;
    }

    // ── Ordered list ──
    if (/^\s*\d+[.)]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trimEnd();
        if (/^\s*\d+[.)]\s+/.test(cur)) {
          items.push(cur.replace(/^\s*\d+[.)]\s+/, ""));
          i++;
        } else if (cur === "" && i + 1 < lines.length && /^\s*\d+[.)]\s+/.test(lines[i + 1].trimEnd())) {
          // Skip blank line between list items
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "ordered_list", items });
      continue;
    }

    // ── Empty line ──
    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    // ── Regular text ──
    paragraphBuffer.push(trimmed);
    i++;
  }

  flushParagraph();
  return blocks;
}

// ── Inline renderer ────────────────────────────────────────────────────────────

function renderInline(text: string, keyPrefix = ""): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match: images, links, bold, italic, inline code
  const regex = /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    const before = text.slice(lastIndex, match.index);
    if (before) nodes.push(before);

    const k = `${keyPrefix}${match.index}`;

    if (match[0].startsWith("![")) {
      // Inline image — render as small inline image
      nodes.push(
        <Image
          key={`img-${k}`}
          source={{ uri: match[3] }}
          style={styles.inlineImage}
          resizeMode="contain"
        />
      );
    } else if (match[4] !== undefined) {
      // Link [text](url)
      const url = match[5];
      nodes.push(
        <Text
          key={`link-${k}`}
          style={styles.link}
          onPress={() => Linking.openURL(url)}
        >
          {match[4]}
        </Text>
      );
    } else if (match[6] !== undefined) {
      // Bold **text**
      nodes.push(
        <Text key={`b-${k}`} style={styles.bold}>
          {match[6]}
        </Text>
      );
    } else if (match[7] !== undefined) {
      // Italic *text*
      nodes.push(
        <Text key={`i-${k}`} style={styles.italic}>
          {match[7]}
        </Text>
      );
    } else if (match[8] !== undefined) {
      // Inline code `text`
      nodes.push(
        <Text key={`c-${k}`} style={styles.inlineCode}>
          {match[8]}
        </Text>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) nodes.push(remaining);

  return nodes;
}

// ── Heading styles by level ────────────────────────────────────────────────────

const headingStyles: Record<HeadingLevel, TextStyle> = {
  1: { fontSize: 20, fontWeight: "700", lineHeight: 28 },
  2: { fontSize: 17, fontWeight: "600", lineHeight: 24, marginTop: 4 },
  3: { fontSize: 15, fontWeight: "600", lineHeight: 22, marginTop: 2 },
  4: { fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 2 },
  5: { fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 2 },
  6: { fontSize: 12, fontWeight: "600", lineHeight: 18, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <Text
                key={i}
                style={[styles.headingBase, headingStyles[block.level]]}
              >
                {renderInline(block.text, `h${i}-`)}
              </Text>
            );

          case "paragraph":
            return (
              <Text key={i} style={styles.paragraph}>
                {renderInline(block.text, `p${i}-`)}
              </Text>
            );

          case "blockquote":
            return (
              <View key={i} style={styles.blockquote}>
                {block.lines.map((line, j) => (
                  <Text key={j} style={styles.blockquoteText}>
                    {line ? renderInline(line, `bq${i}-${j}-`) : " "}
                  </Text>
                ))}
              </View>
            );

          case "code_block":
            return (
              <View key={i} style={styles.codeBlock}>
                <Text style={styles.codeBlockText}>{block.code}</Text>
              </View>
            );

          case "unordered_list":
            return (
              <View key={i} style={styles.list}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.listItem}>
                    <Text style={styles.bullet}>{"\u2022"}</Text>
                    <Text style={styles.listItemText}>
                      {renderInline(item, `ul${i}-${j}-`)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case "ordered_list":
            return (
              <View key={i} style={styles.list}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.listItem}>
                    <Text style={styles.orderedNumber}>{j + 1}.</Text>
                    <Text style={styles.listItemText}>
                      {renderInline(item, `ol${i}-${j}-`)}
                    </Text>
                  </View>
                ))}
              </View>
            );

          case "image":
            return (
              <Pressable
                key={i}
                onPress={() => Linking.openURL(block.url)}
                style={styles.imageContainer}
              >
                <Image
                  source={{ uri: block.url }}
                  style={styles.blockImage}
                  resizeMode="contain"
                />
                {block.alt ? (
                  <Text style={styles.imageCaption}>{block.alt}</Text>
                ) : null}
              </Pressable>
            );

          case "hr":
            return <View key={i} style={styles.hr} />;
        }
      })}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  headingBase: {
    color: colors.text.primary,
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
    paddingHorizontal: 3,
  },
  link: {
    color: colors.accent.indigo,
    textDecorationLine: "underline",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border.default,
    paddingLeft: 12,
    paddingVertical: 4,
    gap: 4,
  },
  blockquoteText: {
    color: "#999999",
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  codeBlock: {
    backgroundColor: "#1c1c1c",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  codeBlockText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    color: "#d0d0d0",
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    color: "#666666",
    fontSize: 14,
    lineHeight: 23,
    width: 12,
  },
  orderedNumber: {
    color: "#666666",
    fontSize: 14,
    lineHeight: 23,
    width: 20,
    textAlign: "right",
  },
  listItemText: {
    color: "#b0b0b0",
    fontSize: 14,
    lineHeight: 23,
    flex: 1,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1c1c1c",
  },
  blockImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  inlineImage: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  imageCaption: {
    color: "#888888",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  hr: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: 4,
  },
});
