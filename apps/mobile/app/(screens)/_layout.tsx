import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.primary },
      }}
    />
  );
}
