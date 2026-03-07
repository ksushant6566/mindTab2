import React from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Toaster } from "sonner-native";
import { queryPersister } from "~/lib/storage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      gcTime: 24 * 60 * 60 * 1000, // 24 hours — keep data for offline
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        }}
      >
        {children}
        <Toaster position="top-center" />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
