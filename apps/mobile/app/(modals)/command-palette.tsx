import { View, Text, Pressable } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { searchGoalsQueryOptions, searchHabitsQueryOptions, searchJournalsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { SearchResults } from "~/components/command-palette/search-results";
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

export default function CommandPaletteModal() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { data: goals = [] } = useQuery(searchGoalsQueryOptions(api, debouncedQuery));
  const { data: habits = [] } = useQuery(searchHabitsQueryOptions(api, debouncedQuery));
  const { data: notes = [] } = useQuery(searchJournalsQueryOptions(api, debouncedQuery));

  const handleQuickAction = useCallback((route: string) => {
    router.back();
    setTimeout(() => router.push(route as any), 100);
  }, [router]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-border">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search goals, habits, notes..."
          autoFocus
          className="flex-1 mr-3"
        />
        <Pressable onPress={() => router.back()} className="p-1">
          <X size={24} color={colors.foreground} />
        </Pressable>
      </View>

      {!debouncedQuery ? (
        <View className="p-4">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Actions
          </Text>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-goal")}
            className="flex-row items-center py-3"
          >
            <Target size={18} color={colors.mutedForeground} />
            <Text className="text-foreground ml-3">Create Goal</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-habit")}
            className="flex-row items-center py-3"
          >
            <CheckSquare size={18} color={colors.mutedForeground} />
            <Text className="text-foreground ml-3">Create Habit</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickAction("/(modals)/create-note")}
            className="flex-row items-center py-3"
          >
            <FileEdit size={18} color={colors.mutedForeground} />
            <Text className="text-foreground ml-3">Create Note</Text>
          </Pressable>
        </View>
      ) : (
        <SearchResults
          goals={goals as any[]}
          habits={habits as any[]}
          notes={notes as any[]}
        />
      )}
    </View>
  );
}
