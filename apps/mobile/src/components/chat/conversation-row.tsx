import { View, Text, Pressable, StyleSheet } from "react-native";

type ConversationRowProps = {
  id: string;
  title: string | null;
  updatedAt: string;
  onPress: (id: string) => void;
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    return "Just now";
  } else if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (diffHours < 48) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

export function ConversationRow({ id, title, updatedAt, onPress }: ConversationRowProps) {
  return (
    <Pressable style={styles.container} onPress={() => onPress(id)}>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? "Untitled"}
        </Text>
        <Text style={styles.timestamp}>{getRelativeTime(updatedAt)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111111",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#e0e0e0",
    fontSize: 14,
  },
  timestamp: {
    color: "#444444",
    fontSize: 12,
  },
  chevron: {
    color: "#444444",
    fontSize: 18,
    marginLeft: 8,
  },
});
