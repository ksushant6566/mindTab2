import { View, Text } from "react-native";
import { Target, CheckSquare, FileEdit, FolderOpen } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { Button } from "~/components/ui/button";

type WelcomeStepProps = {
  userName: string;
  onNext: () => void;
};

const features = [
  { icon: FolderOpen, label: "Projects", desc: "Organize areas of your life" },
  { icon: Target, label: "Goals", desc: "Track progress with priorities" },
  { icon: CheckSquare, label: "Habits", desc: "Build streaks and earn XP" },
  { icon: FileEdit, label: "Notes", desc: "Journal and reflect" },
];

export function WelcomeStep({ userName, onNext }: WelcomeStepProps) {
  const firstName = userName.split(" ")[0] ?? "there";

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-3xl font-bold text-foreground mb-2">
        Welcome, {firstName}!
      </Text>
      <Text className="text-muted-foreground text-base mb-8">
        Let's set up your workspace in under a minute.
      </Text>

      <View className="mb-8">
        {features.map((f) => (
          <View key={f.label} className="flex-row items-center py-3">
            <View className="w-10 h-10 rounded-lg bg-secondary items-center justify-center mr-4">
              <f.icon size={20} color={colors.foreground} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-semibold">{f.label}</Text>
              <Text className="text-muted-foreground text-sm">{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Button size="lg" onPress={onNext}>
        Get Started
      </Button>
    </View>
  );
}
