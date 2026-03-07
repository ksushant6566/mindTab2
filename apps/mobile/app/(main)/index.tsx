import { useState, useRef } from "react";
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { ProjectPills } from "~/components/dashboard/project-pills";
import { HabitsSection } from "~/components/dashboard/habits-section";
import { GoalsSection } from "~/components/dashboard/goals-section";
import { NotesSection } from "~/components/dashboard/notes-section";
import { FAB } from "~/components/dashboard/fab";
import { colors } from "~/styles/colors";

export default function Dashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = e.nativeEvent.contentOffset.y;
    setFabVisible(currentY <= 0 || currentY < lastScrollY.current);
    lastScrollY.current = currentY;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <DashboardHeader />
        <ProjectPills
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
        <HabitsSection projectId={selectedProjectId} />
        <GoalsSection projectId={selectedProjectId} />
        <NotesSection projectId={selectedProjectId} />
      </ScrollView>
      <FAB visible={fabVisible} />
    </SafeAreaView>
  );
}
