import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View, Alert, ActionSheetIOS, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChevronRight, FileText } from "lucide-react-native";
import { journalsQueryOptions, useDeleteJournal } from "@mindtab/core";

import { PressableCard } from "~/components/ui/pressable-card";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { colors } from "~/styles/colors";
import { api } from "~/lib/api-client";

type NotesSectionProps = {
  projectId: string | null;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function NotesSection({ projectId }: NotesSectionProps) {
  const router = useRouter();
  const deleteJournal = useDeleteJournal(api);

  const handleDelete = (noteId: string, noteTitle: string) => {
    Alert.alert("Delete Note", `Delete "${noteTitle || "Untitled"}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteJournal.mutate(noteId),
      },
    ]);
  };

  const handleNoteLongPress = useCallback(
    (note: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const options = ["Edit", "Delete", "Move to Project", "Cancel"];
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, destructiveButtonIndex: 1, cancelButtonIndex: 3 },
          (index) => {
            if (index === 0) router.push(`/(main)/notes/edit/${note.id}` as any);
            else if (index === 1) handleDelete(note.id, note.title || "Untitled");
          },
        );
        return;
      }

      Alert.alert(note.title ?? "Note", undefined, [
        { text: "Edit", onPress: () => router.push(`/(main)/notes/edit/${note.id}` as any) },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDelete(note.id, note.title || "Untitled"),
        },
        { text: "Move to Project" },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [router],
  );

  const { data: notes } = useQuery(
    journalsQueryOptions(api, { projectId: projectId ?? undefined })
  );

  const sortedNotes = [...(notes ?? [])].sort((a, b) => {
    const aDate = a.updatedAt ?? a.createdAt ?? "";
    const bDate = b.updatedAt ?? b.createdAt ?? "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const displayedNotes = sortedNotes.slice(0, 3);
  const totalCount = sortedNotes.length;

  return (
    <View style={styles.container}>
      {/* Section header */}
      <Text style={styles.sectionTitle}>RECENT NOTES</Text>

      {displayedNotes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No notes yet</Text>
          <Pressable onPress={() => router.push("/(modals)/create-note")}>
            <Text style={styles.createLink}>Create your first note</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {displayedNotes.map((note) => {
            const preview = note.content ? stripHtml(note.content) : "";
            const dateStr = note.updatedAt ?? note.createdAt;

            return (
              <SwipeableRow
                key={note.id}
                rightActions={[
                  {
                    label: "Delete",
                    color: colors.feedback.error,
                    onAction: () =>
                      handleDelete(note.id, note.title || "Untitled"),
                  },
                ]}
              >
                <PressableCard
                  onPress={() => router.push(`/(main)/notes/${note.id}`)}
                  onLongPress={() => handleNoteLongPress(note)}
                >
                  {/* Title */}
                  <Text style={styles.noteTitle} numberOfLines={1}>
                    {note.title || "Untitled"}
                  </Text>

                  {/* Preview */}
                  {preview ? (
                    <Text style={styles.notePreview} numberOfLines={2}>
                      {preview}
                    </Text>
                  ) : null}

                  {/* Meta row: date + project pill */}
                  <View style={styles.metaRow}>
                    {dateStr && (
                      <Text style={styles.dateText}>{formatDate(dateStr)}</Text>
                    )}
                    {(note as any).project?.name && (
                      <View style={styles.projectPill}>
                        <Text style={styles.projectPillText}>
                          {(note as any).project.name}
                        </Text>
                      </View>
                    )}
                  </View>
                </PressableCard>
              </SwipeableRow>
            );
          })}

          {/* See all link */}
          {totalCount > 3 && (
            <Pressable
              style={styles.seeAllRow}
              onPress={() => router.push("/(main)/notes")}
            >
              <Text style={styles.seeAllText}>
                See all {totalCount} notes
              </Text>
              <ChevronRight size={16} color={colors.accent.indigo} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.text.muted,
    marginBottom: 12,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text.primary,
  },
  notePreview: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  dateText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  projectPill: {
    backgroundColor: colors.accent.indigoMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  projectPillText: {
    fontSize: 11,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  createLink: {
    fontSize: 14,
    color: colors.accent.indigo,
    marginTop: 4,
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
});
