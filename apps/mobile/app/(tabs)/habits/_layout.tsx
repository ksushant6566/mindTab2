import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function HabitsLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }} />
  );
}
