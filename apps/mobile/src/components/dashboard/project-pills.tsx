import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { projectsQueryOptions } from "@mindtab/core";
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

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <Chip
          label="All"
          selected={selectedProjectId === null}
          onPress={() => onSelect(null)}
          color={colors.accent.indigo}
          size="sm"
        />

        {projects?.map((project) => (
          <Chip
            key={project.id}
            label={project.name}
            selected={selectedProjectId === project.id}
            onPress={() => onSelect(project.id)}
            color={colors.accent.indigo}
            size="sm"
          />
        ))}

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
