import { Stack } from "expo-router";
import { colors } from "~/styles/colors";
import { HeaderRight } from "~/components/header-right";

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.primary },
        animation: "slide_from_right",
        headerStyle: { backgroundColor: colors.bg.primary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="goals/index"
        options={{ headerShown: true, title: "Goals", headerRight: () => <HeaderRight /> }}
      />
      <Stack.Screen
        name="goals/[id]"
        options={{ headerShown: true, title: "Goal", animation: "fade_from_bottom" }}
      />
      <Stack.Screen
        name="habits/index"
        options={{ headerShown: true, title: "Habits", headerRight: () => <HeaderRight /> }}
      />
      <Stack.Screen
        name="habits/[id]"
        options={{ headerShown: true, title: "Habit" }}
      />
      <Stack.Screen
        name="notes/index"
        options={{ headerShown: true, title: "Notes", headerRight: () => <HeaderRight /> }}
      />
      <Stack.Screen
        name="notes/[id]"
        options={{ headerShown: false, animation: "none" }}
      />
      <Stack.Screen
        name="projects/index"
        options={{ headerShown: true, title: "Projects", headerRight: () => <HeaderRight /> }}
      />
      <Stack.Screen
        name="projects/[id]"
        options={{ headerShown: true, title: "Project" }}
      />
    </Stack>
  );
}
