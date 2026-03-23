import React from "react";
import { View, Text, StyleSheet } from "react-native";

type ToolIndicatorProps = {
  tool: string;
  status: "calling" | "done";
};

const TOOL_NAMES: Record<string, string> = {
  list_goals: "Checking your goals",
  get_goal: "Reading goal details",
  create_goal: "Creating goal",
  update_goal: "Updating goal",
  delete_goal: "Deleting goal",
  list_habits: "Checking your habits",
  get_habit: "Reading habit details",
  create_habit: "Creating habit",
  update_habit: "Updating habit",
  delete_habit: "Deleting habit",
  list_notes: "Checking your notes",
  get_note: "Reading note",
  create_note: "Creating note",
  update_note: "Updating note",
  delete_note: "Deleting note",
  search_vault: "Searching vault",
  list_vault: "Browsing vault",
  get_vault_item: "Reading vault item",
  list_projects: "Checking your projects",
  get_project: "Reading project",
  create_project: "Creating project",
  update_project: "Updating project",
  list_journals: "Reading journals",
  create_journal: "Writing journal entry",
  update_journal: "Updating journal",
  delete_journal: "Deleting journal",
  toggle_habit: "Updating habit",
  get_user_profile: "Checking your profile",
};

function humanizeToolName(tool: string | undefined): string {
  if (!tool) return "Using tool";
  if (TOOL_NAMES[tool]) {
    return TOOL_NAMES[tool];
  }
  return tool
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ToolIndicator({ tool, status }: ToolIndicatorProps) {
  const icon = status === "calling" ? "⚡" : "✓";
  const label = humanizeToolName(tool);

  return (
    <View style={styles.pill}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    marginBottom: 4,
  },
  icon: {
    fontSize: 11,
    color: "#666666",
  },
  label: {
    color: "#666666",
    fontSize: 12,
  },
});
