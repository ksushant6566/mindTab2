import { View, Text, Pressable, SectionList } from "react-native";
import { useRouter } from "expo-router";
import { Target, CheckSquare, FileEdit } from "lucide-react-native";
import { colors } from "~/styles/colors";

type SearchResult = {
  id: string;
  title: string;
  type: "goal" | "habit" | "note";
};

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

  const sections = [
    { title: "Goals", data: goals.map((g) => ({ ...g, type: "goal" as const })) },
    { title: "Habits", data: habits.map((h) => ({ ...h, type: "habit" as const })) },
    { title: "Notes", data: notes.map((n) => ({ ...n, type: "note" as const })) },
  ].filter((s) => s.data.length > 0);

  if (sections.length === 0) {
    return (
      <View className="items-center py-12">
        <Text className="text-muted-foreground">No results found</Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.type}-${item.id}`}
      renderSectionHeader={({ section }) => (
        <View className="px-4 pt-3 pb-1">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.title}
          </Text>
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
            className="flex-row items-center px-4 py-3"
          >
            <Icon size={18} color={colors.mutedForeground} />
            <Text className="text-foreground ml-3 flex-1" numberOfLines={1}>
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
