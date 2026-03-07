import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View, ActionSheetIOS, Platform, Alert } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { projectsQueryOptions, useUpdateProject, useDeleteProject } from "@mindtab/core";
import { Chip } from "~/components/ui/chip";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

type ProjectPillsProps = {
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
};

export function ProjectPills({ selectedProjectId, onSelect }: ProjectPillsProps) {
  const router = useRouter();
  const { data: projects } = useQuery(projectsQueryOptions(api));
  const updateProject = useUpdateProject(api);
  const deleteProject = useDeleteProject(api);

  const handleLongPress = (project: { id: string; name?: string | null }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const options = ["Edit", "Archive", "Delete", "Cancel"];
    const destructiveIndex = 2;
    const cancelIndex = 3;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: destructiveIndex,
          cancelButtonIndex: cancelIndex,
          title: project.name ?? "Project",
        },
        (index) => handleAction(index, project),
      );
    } else {
      Alert.alert(project.name ?? "Project", undefined, [
        {
          text: "Edit",
          onPress: () => handleAction(0, project),
        },
        {
          text: "Archive",
          onPress: () => handleAction(1, project),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleAction(2, project),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleAction = (index: number, project: { id: string }) => {
    switch (index) {
      case 0: // Edit
        router.push(`/(main)/projects/${project.id}` as any);
        break;
      case 1: // Archive
        updateProject.mutate({ id: project.id, status: "archived" });
        break;
      case 2: // Delete
        Alert.alert("Delete Project", "This cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteProject.mutate(project.id),
          },
        ]);
        break;
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <Chip
          label="All"
          icon={<CyclingDot />}
          selected={selectedProjectId === null}
          onPress={() => onSelect(null)}
          color={colors.accent.indigo}
          size="sm"
        />

        {projects?.map((project: any) => {
          const goalCount = project._count?.goals ?? 0;
          return (
            <Chip
              key={project.id}
              label={`${project.name ?? ""}${selectedProjectId === project.id ? ` ${goalCount}` : ""}`}
              selected={selectedProjectId === project.id}
              onPress={() => onSelect(project.id)}
              onLongPress={() => handleLongPress(project)}
              color={colors.accent.indigo}
              size="sm"
            />
          );
        })}

        <Chip
          label=""
          selected={false}
          onPress={() => router.push("/(modals)/create-project")}
          color={colors.text.muted}
          size="sm"
          icon={<Plus size={14} color={colors.text.secondary} />}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
  },
  contentContainer: {
    gap: 8,
    paddingVertical: 4,
  },
});

function CyclingDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: colors.accent.indigo,
        },
        animatedStyle,
      ]}
    />
  );
}
