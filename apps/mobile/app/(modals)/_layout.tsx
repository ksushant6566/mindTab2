import { Stack } from "expo-router";
import { colors } from "~/styles/colors";

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      {/* Full-screen modals — need opaque background and swipe-to-dismiss */}
      <Stack.Screen
        name="command-palette"
        options={{
          presentation: "modal",
          animation: "fade",
          contentStyle: { backgroundColor: colors.bg.primary },
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          presentation: "modal",
          contentStyle: { backgroundColor: colors.bg.primary },
        }}
      />
    </Stack>
  );
}
