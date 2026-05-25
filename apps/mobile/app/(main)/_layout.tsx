import { Stack } from "expo-router";
import { colors } from "~/styles/colors";
import { HeaderRight } from "~/components/header-right";
import { MiniAudioPlayer } from "~/components/audio/mini-audio-player";

export default function MainLayout() {
  return (
    <>
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="tasks/index"
        options={{ headerShown: true, title: "Tasks", headerRight: () => <HeaderRight /> }}
      />
      <Stack.Screen
        name="tasks/[id]"
        options={{ headerShown: true, title: "Task", animation: "fade_from_bottom" }}
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
      <Stack.Screen
        name="chat"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="vault/[id]"
        options={{ headerShown: true, title: "Vault", headerBackTitle: "Vault", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="saves/record"
        options={{ presentation: "fullScreenModal", headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="saves/review/[id]"
        options={{ presentation: "fullScreenModal", headerShown: false, animation: "fade" }}
      />
    </Stack>
    <MiniAudioPlayer />
    </>
  );
}
