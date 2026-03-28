import { View, Text, Pressable, StyleSheet } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { searchGoalsQueryOptions, searchHabitsQueryOptions, searchJournalsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { SearchResults } from "~/components/command-palette/search-results";
import type { SearchFilter } from "~/components/command-palette/search-results";
import { Chip } from "~/components/ui/chip";
import { X, Target, CheckSquare, FileEdit } from "lucide-react-native";
import { colors } from "~/styles/colors";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const SEARCH_FILTERS: { key: SearchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "goals", label: "Goals" },
  { key: "habits", label: "Habits" },
  { key: "notes", label: "Notes" },
];

export default function CommandPaletteModal() {
  const router = useRouter();
  const { context } = useLocalSearchParams<{ context?: string }>();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(
    (context as SearchFilter) || "all",
  );
  const debouncedQuery = useDebounce(query, 300);

  const { data: goals = [] } = useQuery(searchGoalsQueryOptions(api, debouncedQuery));
  const { data: habits = [] } = useQuery(searchHabitsQueryOptions(api, debouncedQuery));
  const { data: notes = [] } = useQuery(searchJournalsQueryOptions(api, debouncedQuery));

  const handleQuickAction = useCallback((route: string) => {
    router.back();
    setTimeout(() => router.push(route as any), 100);
  }, [router]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search goals, habits, notes..."
          autoFocus
          style={styles.searchInput}
        />
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {SEARCH_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={activeFilter === f.key}
            onPress={() => setActiveFilter(f.key)}
            size="sm"
          />
        ))}
      </View>

      {!debouncedQuery ? (
        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Quick Actions</Text>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-goal")}
            style={styles.quickActionRow}
          >
            <Target size={18} color={colors.text.muted} />
            <Text style={styles.quickActionText}>Create Goal</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-habit")}
            style={styles.quickActionRow}
          >
            <CheckSquare size={18} color={colors.text.muted} />
            <Text style={styles.quickActionText}>Create Habit</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-note")}
            style={styles.quickActionRow}
          >
            <FileEdit size={18} color={colors.text.muted} />
            <Text style={styles.quickActionText}>Create Note</Text>
          </Pressable>
        </View>
      ) : (
        <SearchResults
          goals={goals as any[]}
          habits={habits as any[]}
          notes={notes as any[]}
          activeFilter={activeFilter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  searchInput: {
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickActions: {
    padding: 16,
  },
  quickActionsTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  quickActionText: {
    fontSize: 16,
    color: colors.text.primary,
    marginLeft: 12,
  },
});
