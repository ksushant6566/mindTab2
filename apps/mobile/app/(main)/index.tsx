import { useState, useRef, useEffect, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { searchGoalsQueryOptions, searchHabitsQueryOptions, searchJournalsQueryOptions } from "@mindtab/core";
import * as Haptics from "expo-haptics";
import { Search } from "lucide-react-native";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { ProjectPills } from "~/components/dashboard/project-pills";
import { HabitsSection } from "~/components/dashboard/habits-section";
import { GoalsSection } from "~/components/dashboard/goals-section";
import { NotesSection } from "~/components/dashboard/notes-section";
import { FAB } from "~/components/dashboard/fab";
import { Chip } from "~/components/ui/chip";
import { SearchResults } from "~/components/command-palette/search-results";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";
import { springs } from "~/lib/animations";

const PULL_THRESHOLD = 60;
const SEARCH_BAR_HEIGHT = 56;

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Dashboard() {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [fabVisible, setFabVisible] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const lastScrollY = useRef(0);
  const searchInputRef = useRef<TextInput>(null);
  const hasTriggered = useRef(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Search queries
  const { data: goals = [] } = useQuery(searchGoalsQueryOptions(api, debouncedQuery));
  const { data: habits = [] } = useQuery(searchHabitsQueryOptions(api, debouncedQuery));
  const { data: notes = [] } = useQuery(searchJournalsQueryOptions(api, debouncedQuery));

  const hasResults = debouncedQuery.length > 0;

  // Reanimated shared values
  const searchBarProgress = useSharedValue(0);
  const pullHintOpacity = useSharedValue(0);

  const showSearch = useCallback(() => {
    setSearchVisible(true);
    searchBarProgress.value = withSpring(1, springs.bouncy);
    // Focus the input after animation starts
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, [searchBarProgress]);

  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    searchBarProgress.value = withSpring(0, springs.snappy);
    // Wait for animation to finish before hiding
    setTimeout(() => {
      setSearchVisible(false);
      setSearchQuery("");
      hasTriggered.current = false;
    }, 250);
  }, [searchBarProgress]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = e.nativeEvent.contentOffset.y;

    // FAB visibility
    setFabVisible(currentY <= 0 || currentY < lastScrollY.current);
    lastScrollY.current = currentY;

    // Pull-to-search: detect overscroll past threshold
    if (!searchVisible) {
      if (currentY < -PULL_THRESHOLD && !hasTriggered.current) {
        hasTriggered.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showSearch();
      }

      // Animate the pull hint based on overscroll amount
      if (currentY < 0) {
        const progress = Math.min(Math.abs(currentY) / PULL_THRESHOLD, 1);
        pullHintOpacity.value = progress;
      } else {
        pullHintOpacity.value = 0;
      }
    }
  };

  // Animated styles for the search bar
  const searchBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          searchBarProgress.value,
          [0, 1],
          [-SEARCH_BAR_HEIGHT, 0],
        ),
      },
    ],
    opacity: searchBarProgress.value,
  }));

  // Animated style for pull hint (shown before search triggers)
  const pullHintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pullHintOpacity.value, [0, 0.5, 1], [0, 0.3, 0.8]),
    transform: [
      {
        translateY: interpolate(pullHintOpacity.value, [0, 1], [-10, 0]),
      },
    ],
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Pull hint - visible during overscroll before threshold */}
      {!searchVisible && (
        <Animated.View style={[styles.pullHint, pullHintAnimatedStyle]}>
          <Search size={16} color={colors.text.muted} />
          <Text style={styles.pullHintText}>Pull to search</Text>
        </Animated.View>
      )}

      {/* Search bar - springs in from above */}
      {searchVisible && (
        <Animated.View style={[styles.searchBarContainer, searchBarAnimatedStyle]}>
          <View style={styles.searchBarInner}>
            <Search size={18} color={colors.text.muted} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search goals, habits, notes..."
              placeholderTextColor={colors.text.muted}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={dismissSearch} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Search results overlay */}
      {searchVisible && hasResults && (
        <View style={styles.searchResultsContainer}>
          <SearchResults
            goals={goals as any[]}
            habits={habits as any[]}
            notes={notes as any[]}
          />
        </View>
      )}

      {/* Empty search state */}
      {searchVisible && !hasResults && searchQuery.length === 0 && (
        <View style={styles.searchEmptyState}>
          <Text style={styles.searchEmptyText}>
            Type to search across your goals, habits, and notes
          </Text>
          <View style={styles.quickActions}>
            <Chip label="+ Goal" size="sm" onPress={() => router.push("/(modals)/create-goal")} />
            <Chip label="+ Habit" size="sm" onPress={() => router.push("/(modals)/create-habit")} />
            <Chip label="+ Note" size="sm" onPress={() => router.push("/(modals)/create-note")} />
          </View>
        </View>
      )}

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!searchVisible || !hasResults}
      >
        <DashboardHeader />
        <HabitsSection />
        <ProjectPills
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
        <GoalsSection projectId={selectedProjectId} />
        <NotesSection projectId={selectedProjectId} />
      </ScrollView>
      <FAB visible={fabVisible && !searchVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pullHint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  pullHintText: {
    color: colors.text.muted,
    fontSize: 13,
    marginLeft: 6,
    fontWeight: "500",
  },
  searchBarContainer: {
    zIndex: 20,
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  searchBarInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: SEARCH_BAR_HEIGHT,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  cancelText: {
    color: colors.accent.indigo,
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 12,
  },
  searchResultsContainer: {
    position: "absolute",
    top: SEARCH_BAR_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    backgroundColor: colors.bg.primary,
  },
  searchEmptyState: {
    position: "absolute",
    top: SEARCH_BAR_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    backgroundColor: colors.bg.primary,
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  searchEmptyText: {
    color: colors.text.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
});
