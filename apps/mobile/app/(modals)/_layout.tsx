import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
