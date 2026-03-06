import "../src/styles/globals.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { Providers } from "~/providers";
import { useAuth } from "~/hooks/use-auth";
import { colors } from "~/styles/colors";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasChecked, user, refreshSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hasChecked) {
      refreshSession();
    }
  }, [hasChecked]);

  useEffect(() => {
    if (isLoading || !hasChecked) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "(onboarding)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && !user?.onboardingCompleted && !inOnboarding) {
      router.replace("/(onboarding)");
    } else if (isAuthenticated && user?.onboardingCompleted && (inAuthGroup || inOnboarding)) {
      router.replace("/(tabs)/goals");
    }
  }, [isAuthenticated, isLoading, hasChecked, user, segments]);

  if (isLoading || !hasChecked) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
        </Stack>
      </AuthGuard>
    </Providers>
  );
}
