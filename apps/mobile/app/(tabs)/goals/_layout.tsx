import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function GoalsLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }} />
  );
}
