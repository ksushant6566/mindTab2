import { View, Text, Pressable, StyleSheet } from "react-native";

type EmptyStateProps = {
  onSuggestionPress: (text: string) => void;
};

const SUGGESTIONS = [
  "What are my active goals?",
  "Summarize my saved articles",
  "Create a new habit",
  "How was my week?",
];

export function ChatEmptyState({ onSuggestionPress }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MindTab</Text>
      <Text style={styles.subtitle}>Your personal assistant</Text>
      <View style={styles.chipsRow}>
        {SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            style={styles.chip}
            onPress={() => onSuggestionPress(suggestion)}
          >
            <Text style={styles.chipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#fafafa",
    fontSize: 22,
    fontWeight: "600",
  },
  subtitle: {
    color: "#555555",
    fontSize: 14,
    marginBottom: 36,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#222222",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: "#888888",
    fontSize: 13,
  },
});
