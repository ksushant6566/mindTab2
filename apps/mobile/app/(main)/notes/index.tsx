import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  FileText,
  BookOpen,
  Video,
  Mic,
  Globe,
  StickyNote,
} from "lucide-react-native";
import { notesQueryOptions, useDeleteNote } from "@mindtab/core";

import { ProjectPills } from "~/components/dashboard/project-pills";
import { Chip } from "~/components/ui/chip";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { EmptyState } from "~/components/ui/empty-state";
import { ListHeader } from "~/components/list-header";
import { FAB } from "~/components/dashboard/fab";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";

// ---------- Constants ----------

type NoteType = "all" | "article" | "book" | "video" | "podcast" | "website";

const TYPE_FILTERS: {
  key: NoteType;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "all", label: "All", icon: null, color: colors.accent.indigo },
  {
    key: "article",
    label: "Article",
    icon: <FileText size={13} color={colors.noteType.article} />,
    color: colors.noteType.article,
  },
  {
    key: "book",
    label: "Book",
    icon: <BookOpen size={13} color={colors.noteType.book} />,
    color: colors.noteType.book,
  },
  {
    key: "video",
    label: "Video",
    icon: <Video size={13} color={colors.noteType.video} />,
    color: colors.noteType.video,
  },
  {
    key: "podcast",
    label: "Podcast",
    icon: <Mic size={13} color={colors.noteType.podcast} />,
    color: colors.noteType.podcast,
  },
  {
    key: "website",
    label: "Website",
    icon: <Globe size={13} color={colors.noteType.website} />,
    color: colors.noteType.website,
  },
];

const noteTypeBadgeColors: Record<string, string> = {
  article: colors.noteType.article,
  book: colors.noteType.book,
  video: colors.noteType.video,
  podcast: colors.noteType.podcast,
  website: colors.noteType.website,
};


function renderTypeIcon(type: string, color: string) {
  switch (type) {
    case "article":
      return <FileText size={11} color={color} />;
    case "book":
      return <BookOpen size={11} color={color} />;
    case "video":
      return <Video size={11} color={color} />;
    case "podcast":
      return <Mic size={11} color={color} />;
    case "website":
      return <Globe size={11} color={color} />;
    default:
      return null;
  }
}

const keyExtractor = (item: any) => item.id;

// ---------- Helpers ----------

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------- Memoized note row ----------

const NoteRow = React.memo(function NoteRow({
  note,
  onPress,
  onEdit,
  onDelete,
}: {
  note: any;
  onPress: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const preview = note.content ? stripHtml(note.content) : "";
  const dateStr = note.updatedAt ?? note.createdAt;
  const noteType = note.type as string | undefined;
  const badgeColor = noteType
    ? noteTypeBadgeColors[noteType] ?? colors.text.muted
    : null;

  const handlePress = useCallback(() => onPress(note.id), [note.id, onPress]);
  const handleEdit = useCallback(() => onEdit(note.id), [note.id, onEdit]);
  const handleDelete = useCallback(() => onDelete(note.id), [note.id, onDelete]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const options = ["Edit", "Move to Project", "Delete", "Cancel"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (index) => {
          if (index === 0) onEdit(note.id);
          else if (index === 2) onDelete(note.id);
        },
      );
      return;
    }
    Alert.alert(note.title ?? "Note", undefined, [
      { text: "Edit", onPress: () => onEdit(note.id) },
      { text: "Move to Project" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(note.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [note.id, note.title, onEdit, onDelete]);

  const rightActions = useMemo(() => [
    { label: "Edit", color: colors.status.active, onAction: handleEdit },
    { label: "Delete", color: colors.feedback.error, onAction: handleDelete },
  ], [handleEdit, handleDelete]);

  return (
    <SwipeableRow rightActions={rightActions}>
      <PressableCard onPress={handlePress} onLongPress={handleLongPress}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {note.title || "Untitled"}
        </Text>

        {preview ? (
          <Text style={styles.notePreview} numberOfLines={3}>
            {preview}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {noteType && badgeColor && (
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: badgeColor + "26" },
              ]}
            >
              {renderTypeIcon(noteType, badgeColor)}
              <Text style={[styles.typeBadgeText, { color: badgeColor }]}>
                {noteType.charAt(0).toUpperCase() + noteType.slice(1)}
              </Text>
            </View>
          )}

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
});

// ---------- Screen ----------

export default function NotesScreen() {
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<NoteType>("all");
  const [refreshing, setRefreshing] = useState(false);

  const projectId = selectedProjectId ?? undefined;
  const { data: notes, isLoading, refetch } = useQuery(
    notesQueryOptions(api, { projectId }),
  );

  const deleteNote = useDeleteNote(api);

  // Stable callbacks for NoteRow
  const handleNotePress = useCallback((id: string) => {
    router.push(`/(main)/notes/${id}`);
  }, [router]);

  const handleNoteEdit = useCallback((id: string) => {
    router.push({ pathname: `/(main)/notes/[id]`, params: { id, editing: "true" } } as any);
  }, [router]);

  const handleNoteDelete = useCallback((id: string) => {
    deleteNote.mutate(id);
  }, [deleteNote]);

  // Filter by type + sort
  const filteredNotes = useMemo(() => {
    let list = [...(notes ?? [])];
    if (typeFilter !== "all") {
      list = list.filter((n: any) => n.type === typeFilter);
    }

    list.sort((a, b) => {
      const aDate = a.updatedAt ?? a.createdAt ?? "";
      const bDate = b.updatedAt ?? b.createdAt ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    return list;
  }, [notes, typeFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <NoteRow
        note={item}
        onPress={handleNotePress}
        onEdit={handleNoteEdit}
        onDelete={handleNoteDelete}
      />
    ),
    [handleNotePress, handleNoteEdit, handleNoteDelete],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon={StickyNote}
        title="No notes yet"
        description="Capture thoughts, articles, and ideas"
      />
    );
  }, [isLoading]);

  const noteCount = (notes ?? []).length;
  const noteSubtitle = `${noteCount} ${noteCount === 1 ? "note" : "notes"}`;

  return (
    <View style={styles.screen}>
      <ListHeader title="Notes" subtitle={noteSubtitle} searchContext="notes" />
      <FlatList
        data={filteredNotes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        removeClippedSubviews
        maxToRenderPerBatch={5}
        initialNumToRender={8}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ProjectPills
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />

            <View style={styles.filterRow}>
              {TYPE_FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  icon={f.icon ?? undefined}
                  selected={typeFilter === f.key}
                  onPress={() => setTypeFilter(f.key)}
                  color={f.color}
                  size="sm"
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.indigo}
          />
        }
      />
      <FAB visible contextFilter="note" />
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listHeader: {
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },


  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  // Note card
  noteTitle: {
    fontSize: 17,
    fontWeight: "600",
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
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
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
    fontSize: 12,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
});
