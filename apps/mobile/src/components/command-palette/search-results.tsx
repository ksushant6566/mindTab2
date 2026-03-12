import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Target, CheckSquare, FileEdit, ChevronRight, ChevronDown } from "lucide-react-native";
import { colors } from "~/styles/colors";

export type SearchFilter = "all" | "goals" | "habits" | "notes";

type SearchResultsProps = {
  goals: Array<{ id: string; title: string }>;
  habits: Array<{ id: string; title: string }>;
  notes: Array<{ id: string; title: string }>;
  activeFilter: SearchFilter;
};

const categoryConfig = {
  goals: { icon: Target, label: "Goals", singular: "goal", route: "/(main)/goals/" },
  habits: { icon: CheckSquare, label: "Habits", singular: "habit", route: "/(main)/habits/" },
  notes: { icon: FileEdit, label: "Notes", singular: "note", route: "/(main)/notes/" },
} as const;

type CategoryKey = keyof typeof categoryConfig;

export function SearchResults({ goals, habits, notes, activeFilter }: SearchResultsProps) {
  const router = useRouter();
  const [expandedSections, setExpandedSections] = useState<Set<CategoryKey>>(new Set());

  const categories: Record<CategoryKey, Array<{ id: string; title: string }>> = {
    goals,
    habits,
    notes,
  };

  const toggleSection = (key: CategoryKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const navigateToItem = (type: CategoryKey, id: string) => {
    router.back();
    setTimeout(() => router.push(`${categoryConfig[type].route}${id}` as any), 100);
  };

  const renderItems = (items: Array<{ id: string; title: string }>, type: CategoryKey) => {
    const Icon = categoryConfig[type].icon;
    return items.map((item) => (
      <Pressable
        key={`${type}-${item.id}`}
        onPress={() => navigateToItem(type, item.id)}
        style={styles.resultRow}
      >
        <Icon size={18} color={colors.text.muted} />
        <Text style={styles.resultText} numberOfLines={1}>
          {item.title}
        </Text>
      </Pressable>
    ));
  };

  const renderSection = (key: CategoryKey) => {
    const items = categories[key];
    if (items.length === 0) return null;
    return (
      <View key={key}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{categoryConfig[key].label}</Text>
        </View>
        {renderItems(items, key)}
      </View>
    );
  };

  const renderCollapsedSection = (key: CategoryKey) => {
    const items = categories[key];
    if (items.length === 0) return null;

    const isExpanded = expandedSections.has(key);
    const Icon = categoryConfig[key].icon;
    const count = items.length;
    const noun = count === 1 ? categoryConfig[key].singular : categoryConfig[key].label.toLowerCase();

    return (
      <View key={`collapsed-${key}`}>
        <Pressable onPress={() => toggleSection(key)} style={styles.collapsedRow}>
          <Icon size={14} color={colors.text.muted} />
          <Text style={styles.collapsedText}>
            {count} {noun} matched
          </Text>
          {isExpanded ? (
            <ChevronDown size={14} color={colors.text.muted} />
          ) : (
            <ChevronRight size={14} color={colors.text.muted} />
          )}
        </Pressable>
        {isExpanded && renderItems(items, key)}
      </View>
    );
  };

  const totalResults = goals.length + habits.length + notes.length;
  if (totalResults === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No results found</Text>
      </View>
    );
  }

  if (activeFilter === "all") {
    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        {renderSection("goals")}
        {renderSection("habits")}
        {renderSection("notes")}
      </ScrollView>
    );
  }

  const otherKeys = (["goals", "habits", "notes"] as const).filter((k) => k !== activeFilter);

  const activeItems = categories[activeFilter];

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {activeItems.length > 0 ? (
        renderSection(activeFilter)
      ) : (
        <View style={styles.emptyFilterContainer}>
          <Text style={styles.emptyText}>
            No {categoryConfig[activeFilter].label.toLowerCase()} found
          </Text>
        </View>
      )}
      {otherKeys.map((key) => renderCollapsedSection(key))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyFilterContainer: {
    alignItems: "center",
    paddingVertical: 24,
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
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  collapsedText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: "500",
  },
});
