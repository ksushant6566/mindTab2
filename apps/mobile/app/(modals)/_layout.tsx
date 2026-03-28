import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

const transparentModalOptions = {
  presentation: "transparentModal" as const,
  animation: "fade" as const,
  headerShown: false,
  contentStyle: { backgroundColor: "transparent" },
};

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="create-goal" options={transparentModalOptions} />
      <Stack.Screen name="create-habit" options={transparentModalOptions} />
      <Stack.Screen name="create-note" options={transparentModalOptions} />
      <Stack.Screen name="create-project" options={transparentModalOptions} />
    </Stack>
  );
}
