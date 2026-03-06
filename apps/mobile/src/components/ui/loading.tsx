import { View, ActivityIndicator } from "react-native";
import { colors } from "~/styles/colors";

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={colors.foreground} />
    </View>
  );
}
