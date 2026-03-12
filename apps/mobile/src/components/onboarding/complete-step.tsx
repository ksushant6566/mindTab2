import { View, Text } from "react-native";
import { Check } from "lucide-react-native";
import { Button } from "~/components/ui/button";

type CompleteStepProps = {
  onComplete: () => void;
  loading: boolean;
};

export function CompleteStep({ onComplete, loading }: CompleteStepProps) {
  return (
    <View className="flex-1 justify-center items-center px-6">
      <View className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 items-center justify-center mb-6">
        <Check size={32} color="#34d399" />
      </View>

      <Text className="text-2xl font-bold text-foreground mb-2 text-center">
        You're all set!
      </Text>
      <Text className="text-muted-foreground text-sm text-center mb-8">
        Your workspace is ready. Start tracking goals, building habits, and capturing thoughts.
      </Text>

      <Button size="lg" onPress={onComplete} loading={loading} className="w-full">
        Go to Dashboard
      </Button>
    </View>
  );
}
