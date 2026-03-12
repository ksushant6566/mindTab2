import { useState, useMemo } from "react";
import { SectionList, Text, View, RefreshControl, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { goalsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { GoalItem } from "./goal-item";
import { EmptyState } from "~/components/ui/empty-state";
import { Loading } from "~/components/ui/loading";
import { Target, ChevronDown } from "lucide-react-native";
import { colors } from "~/styles/colors";

type Goal = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  impact?: string | null;
  projectId?: string | null;
  position?: number;
  createdAt?: string;
};

type SortOption = "position" | "priority" | "impact" | "newest" | "oldest";

const sortLabels: Record<SortOption, string> = {
  position: "Position",
  priority: "Priority",
  impact: "Impact",
  newest: "Newest",
  oldest: "Oldest",
};

const priorityOrder: Record<string, number> = {
  priority_1: 0,
  priority_2: 1,
  priority_3: 2,
  priority_4: 3,
};

const impactOrder: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusOrder = ["in_progress", "pending", "completed"];
const statusLabels: Record<string, string> = {
  in_progress: "In Progress",
  pending: "Pending",
  completed: "Completed",
};

function sortGoals(goals: Goal[], sortBy: SortOption): Goal[] {
  const sorted = [...goals];
  switch (sortBy) {
    case "position":
      return sorted.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    case "priority":
      return sorted.sort(
        (a, b) =>
          (priorityOrder[a.priority ?? ""] ?? 99) -
          (priorityOrder[b.priority ?? ""] ?? 99),
      );
    case "impact":
      return sorted.sort(
        (a, b) =>
          (impactOrder[a.impact ?? ""] ?? 99) -
          (impactOrder[b.impact ?? ""] ?? 99),
      );
    case "newest":
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
    case "oldest":
      return sorted.sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime(),
      );
    default:
      return sorted;
  }
}

export function GoalList() {
  const { data: goals = [], isLoading, isFetching, refetch } = useQuery(goalsQueryOptions(api));
  const [sortBy, setSortBy] = useState<SortOption>("position");
  const [showSortMenu, setShowSortMenu] = useState(false);

  if (isLoading) return <Loading />;

  if (goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Create your first goal to start tracking progress."
      />
    );
  }

  const sections = useMemo(() => {
    return statusOrder
      .map((status) => ({
        title: statusLabels[status] ?? status,
        data: sortGoals(
          (goals as Goal[]).filter((g) => g.status === status),
          sortBy,
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [goals, sortBy]);

  return (
    <View style={{ flex: 1 }}>
      {/* Sort dropdown */}
      <View style={sortStyles.sortRow}>
        <Pressable
          style={sortStyles.sortButton}
          onPress={() => setShowSortMenu(!showSortMenu)}
        >
          <Text style={sortStyles.sortLabel}>Sort: {sortLabels[sortBy]}</Text>
          <ChevronDown size={14} color={colors.text.secondary} />
        </Pressable>
      </View>

      {showSortMenu && (
        <View style={sortStyles.dropdownMenu}>
          {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
            <Pressable
              key={opt}
              style={sortStyles.dropdownItem}
              onPress={() => {
                setSortBy(opt);
                setShowSortMenu(false);
              }}
            >
              <Text
                style={[
                  sortStyles.dropdownText,
                  sortBy === opt && { color: colors.accent.indigo },
                ]}
              >
                {sortLabels[opt]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GoalItem goal={item} />}
        renderSectionHeader={({ section }) => (
          <View className="px-4 pt-4 pb-1">
            <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {section.title} ({section.data.length})
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="#fafafa"
          />
        }
      />
    </View>
  );
}

const sortStyles = StyleSheet.create({
  sortRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.secondary,
  },
  dropdownMenu: {
    position: "absolute",
    top: 44,
    right: 16,
    zIndex: 20,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 4,
    minWidth: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
});
