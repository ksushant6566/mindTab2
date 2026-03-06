import { SectionList, Text, View, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { goalsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { GoalItem } from "./goal-item";
import { EmptyState } from "~/components/ui/empty-state";
import { Loading } from "~/components/ui/loading";
import { Target } from "lucide-react-native";

type Goal = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  impact?: string | null;
  projectId?: string | null;
  position?: number;
};

const statusOrder = ["in_progress", "pending", "completed"];
const statusLabels: Record<string, string> = {
  in_progress: "In Progress",
  pending: "Pending",
  completed: "Completed",
};

export function GoalList() {
  const { data: goals = [], isLoading, isFetching, refetch } = useQuery(goalsQueryOptions(api));

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

  const sections = statusOrder
    .map((status) => ({
      title: statusLabels[status] ?? status,
      data: (goals as Goal[]).filter((g) => g.status === status),
    }))
    .filter((s) => s.data.length > 0);

  return (
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
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fafafa" />
      }
    />
  );
}
