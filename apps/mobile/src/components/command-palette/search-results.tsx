import { View, Text, Pressable, SectionList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Target, CheckSquare, FileEdit } from "lucide-react-native";
import { colors } from "~/styles/colors";

type SearchResultsProps = {
  goals: Array<{ id: string; title: string }>;
  habits: Array<{ id: string; title: string }>;
  notes: Array<{ id: string; title: string }>;
};

const iconMap = {
  goal: Target,
  habit: CheckSquare,
  note: FileEdit,
};

const routeMap = {
  goal: "/(main)/goals/",
  habit: "/(main)/habits/",
  note: "/(main)/notes/",
};

export function SearchResults({ goals, habits, notes }: SearchResultsProps) {
  const router = useRouter();

  type SearchItem = { id: string; title: string; type: "goal" | "habit" | "note" };

  const sections: Array<{ title: string; data: SearchItem[] }> = [
    { title: "Goals", data: goals.map((g) => ({ ...g, type: "goal" as const })) },
    { title: "Habits", data: habits.map((h) => ({ ...h, type: "habit" as const })) },
    { title: "Notes", data: notes.map((n) => ({ ...n, type: "note" as const })) },
  ].filter((s) => s.data.length > 0);

  if (sections.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No results found</Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.type}-${item.id}`}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const Icon = iconMap[item.type];
        return (
          <Pressable
            onPress={() => {
              router.back();
              setTimeout(() => router.push(`${routeMap[item.type]}${item.id}` as any), 100);
            }}
            style={styles.resultRow}
          >
            <Icon size={18} color={colors.text.muted} />
            <Text style={styles.resultText} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        );
      }}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 14,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultText: {
    color: colors.text.primary,
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
  },
});
