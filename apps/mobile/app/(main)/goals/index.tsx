import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { GoalList } from "~/components/goals/goal-list";
import { Plus } from "lucide-react-native";
import { colors } from "~/styles/colors";

export default function GoalsScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <GoalList />
      <Pressable
        onPress={() => router.push("/(modals)/create-goal")}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary items-center justify-center"
        style={{ elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
      >
        <Plus size={24} color={colors.background} />
      </Pressable>
    </View>
  );
}
