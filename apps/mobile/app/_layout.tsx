import "../src/styles/globals.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { Providers } from "~/providers";
import { useAuth, useAuthStore } from "~/hooks/use-auth";
import { OfflineBanner } from "~/components/offline-banner";
import { colors } from "~/styles/colors";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasChecked, user, refreshSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hasChecked) {
      // Timeout after 10s — treat as unauthenticated so user sees login.
      const timeout = setTimeout(() => {
        if (!useAuthStore.getState()._hasChecked) {
          useAuthStore.setState({ isLoading: false, _hasChecked: true });
        }
      }, 10_000);

      refreshSession().finally(() => clearTimeout(timeout));
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
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, hasChecked, user, segments]);

  if (isLoading || !hasChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.primary }}>
        <ActivityIndicator size="large" color={colors.text.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="light" />
      <OfflineBanner />
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="(modals)" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
          <Stack.Screen name="(screens)" options={{ presentation: "modal" }} />
        </Stack>
      </AuthGuard>
    </Providers>
  );
}
