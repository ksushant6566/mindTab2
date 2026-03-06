import { View, Text } from "react-native";
import { FileEdit, AtSign, Link } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { Button } from "~/components/ui/button";

type NotesIntroStepProps = {
  onNext: () => void;
  onBack: () => void;
};

const features = [
  { icon: FileEdit, title: "Rich notes", desc: "Write and format your thoughts" },
  { icon: AtSign, title: "@mentions", desc: "Link notes to goals, habits, and more" },
  { icon: Link, title: "Connected", desc: "Notes pair with everything in MindTab" },
];

export function NotesIntroStep({ onNext, onBack }: NotesIntroStepProps) {
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        Notes — your thinking space
      </Text>
      <Text className="text-muted-foreground text-sm mb-8">
        Journal, plan, and reflect. Everything you write is saved and organized by project.
      </Text>

      <View className="mb-8">
        {features.map((f) => (
          <View key={f.title} className="flex-row items-center py-3">
            <View className="w-10 h-10 rounded-lg bg-secondary items-center justify-center mr-4">
              <f.icon size={20} color={colors.foreground} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-semibold">{f.title}</Text>
              <Text className="text-muted-foreground text-sm">{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="flex-row gap-3">
        <Button variant="secondary" onPress={onBack} className="flex-1">
          Back
        </Button>
        <Button onPress={onNext} className="flex-1">
          Continue
        </Button>
      </View>
    </View>
  );
}
