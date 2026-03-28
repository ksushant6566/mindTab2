import React from "react";
import { StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { colors } from "~/styles/colors";

type MarkdownContentProps = {
  content: string;
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown style={markdownStyles}>
      {content}
    </Markdown>
  );
}

const markdownStyles = StyleSheet.create({
  body: {
    color: "#b0b0b0",
    fontSize: 14,
    lineHeight: 23,
  },
  heading1: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    marginTop: 0,
    marginBottom: 8,
  },
  heading2: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
    marginTop: 4,
    marginBottom: 6,
  },
  heading3: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 2,
    marginBottom: 4,
  },
  heading4: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 2,
    marginBottom: 4,
  },
  heading5: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 2,
    marginBottom: 4,
  },
  heading6: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
  },
  strong: {
    fontWeight: "700",
    color: "#d0d0d0",
  },
  em: {
    fontStyle: "italic",
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
    backgroundColor: "transparent",
    marginLeft: 0,
  },
  code_inline: {
    fontFamily: "monospace",
    backgroundColor: "#1c1c1c",
    color: "#d0d0d0",
    fontSize: 13,
    paddingHorizontal: 3,
  },
  code_block: {
    fontFamily: "monospace",
    backgroundColor: "#1c1c1c",
    color: "#d0d0d0",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  fence: {
    fontFamily: "monospace",
    backgroundColor: "#1c1c1c",
    color: "#d0d0d0",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  bullet_list: {
    marginBottom: 6,
  },
  ordered_list: {
    marginBottom: 6,
  },
  list_item: {
    marginBottom: 4,
  },
  bullet_list_icon: {
    color: "#666666",
    fontSize: 14,
    lineHeight: 23,
  },
  ordered_list_icon: {
    color: "#666666",
    fontSize: 14,
    lineHeight: 23,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  hr: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
  },
  thead: {
    backgroundColor: "#1c1c1c",
  },
  th: {
    color: colors.text.primary,
    fontWeight: "600",
    padding: 8,
    borderBottomWidth: 1,
    borderColor: colors.border.default,
  },
  td: {
    color: "#b0b0b0",
    padding: 8,
    borderBottomWidth: 1,
    borderColor: colors.border.default,
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: colors.border.default,
  },
});
