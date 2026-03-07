import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { HabitList } from "~/components/habits/habit-list";
import { Plus } from "lucide-react-native";
import { colors } from "~/styles/colors";

export default function HabitsScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <HabitList />
      <Pressable
        onPress={() => router.push("/(modals)/create-habit")}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary items-center justify-center"
        style={{ elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
      >
        <Plus size={24} color={colors.background} />
      </Pressable>
    </View>
  );
}
