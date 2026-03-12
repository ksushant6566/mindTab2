import { useState, useRef, useCallback } from "react";
import {
  ScrollView,
  View,
  RefreshControl,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { ProjectPills } from "~/components/dashboard/project-pills";
import { HabitsBubble } from "~/components/dashboard/habits-bubble";
import { GoalsSection } from "~/components/dashboard/goals-section";
import { NotesSection } from "~/components/dashboard/notes-section";
import { FAB } from "~/components/dashboard/fab";
import { useShakeDetector } from "~/hooks/use-shake-detector";
import { colors } from "~/styles/colors";

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [fabVisible, setFabVisible] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastScrollY = useRef(0);

  const handleShake = useCallback(() => {
    router.push("/(modals)/command-palette");
  }, [router]);

  useShakeDetector(handleShake);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }, [queryClient]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = e.nativeEvent.contentOffset.y;
    setFabVisible(currentY <= 0 || currentY < lastScrollY.current);
    lastScrollY.current = currentY;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: 20 }}>
        <DashboardHeader />
      </View>
      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.indigo}
          />
        }
      >
        <ProjectPills
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
        <GoalsSection projectId={selectedProjectId} />
        <NotesSection projectId={selectedProjectId} />
      </ScrollView>
      <HabitsBubble />
      <FAB visible={fabVisible} />
    </View>
  );
}

