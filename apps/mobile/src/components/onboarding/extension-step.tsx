import { View, Text } from "react-native";
import { Monitor, Smartphone } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { Button } from "~/components/ui/button";

type ExtensionStepProps = {
  onNext: () => void;
  onBack: () => void;
};

export function ExtensionStep({ onNext, onBack }: ExtensionStepProps) {
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-2xl font-bold text-foreground mb-2">
        Also available on desktop
      </Text>
      <Text className="text-muted-foreground text-sm mb-8">
        MindTab replaces your Chrome new tab page with your dashboard. Install the extension on your computer for the full experience.
      </Text>

      <View className="rounded-lg border border-border p-4 mb-8">
        <View className="flex-row items-center mb-3">
          <Monitor size={20} color={colors.foreground} />
          <Text className="text-foreground font-semibold ml-3">Chrome Extension</Text>
        </View>
        <Text className="text-muted-foreground text-sm mb-3">
          Visit app.mindtab.in on your desktop to install the Chrome extension.
        </Text>
        <View className="flex-row items-center">
          <Smartphone size={16} color={colors.mutedForeground} />
          <Text className="text-muted-foreground text-xs ml-2">
            You're on mobile — we'll keep track of everything here too.
          </Text>
        </View>
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
