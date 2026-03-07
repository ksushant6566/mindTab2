import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
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
import { journalsQueryOptions, useDeleteJournal } from "@mindtab/core";

import { ProjectPills } from "~/components/dashboard/project-pills";
import { Chip } from "~/components/ui/chip";
import { SwipeableRow } from "~/components/ui/swipeable-row";
import { PressableCard } from "~/components/ui/pressable-card";
import { EmptyState } from "~/components/ui/empty-state";
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

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

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

// ---------- Screen ----------

export default function NotesScreen() {
  const router = useRouter();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<NoteType>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const projectId = selectedProjectId ?? undefined;
  const { data: notes, isLoading, refetch } = useQuery(
    journalsQueryOptions(api, { projectId }),
  );

  const deleteJournal = useDeleteJournal(api);

  // Filter by type + sort
  const filteredNotes = useMemo(() => {
    let list = [...(notes ?? [])];
    if (typeFilter !== "all") {
      list = list.filter((n: any) => n.type === typeFilter);
    }
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      list = list.filter((n: any) =>
        n.title?.toLowerCase().includes(query) ||
        stripHtml(n.content ?? "").toLowerCase().includes(query),
      );
    }
    list.sort((a, b) => {
      const aDate = a.updatedAt ?? a.createdAt ?? "";
      const bDate = b.updatedAt ?? b.createdAt ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    return list;
  }, [notes, typeFilter, debouncedSearch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item: note }: { item: any }) => {
      const preview = note.content ? stripHtml(note.content) : "";
      const dateStr = note.updatedAt ?? note.createdAt;
      const noteType = note.type as string | undefined;
      const badgeColor = noteType
        ? noteTypeBadgeColors[noteType] ?? colors.text.muted
        : null;

      const handleLongPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        const options = ["Edit", "Move to Project", "Delete", "Cancel"];
        if (Platform.OS === "ios") {
          ActionSheetIOS.showActionSheetWithOptions(
            { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
            (index) => {
              if (index === 0) router.push(`/(main)/notes/edit/${note.id}` as any);
              else if (index === 2) deleteJournal.mutate(note.id);
            },
          );
          return;
        }
        Alert.alert(note.title ?? "Note", undefined, [
          { text: "Edit", onPress: () => router.push(`/(main)/notes/edit/${note.id}` as any) },
          { text: "Move to Project" },
          { text: "Delete", style: "destructive", onPress: () => deleteJournal.mutate(note.id) },
          { text: "Cancel", style: "cancel" },
        ]);
      };

      return (
        <SwipeableRow
          rightActions={[
            {
              label: "Edit",
              color: colors.status.active,
              onAction: () =>
                router.push(`/(main)/notes/edit/${note.id}`),
            },
            {
              label: "Delete",
              color: colors.feedback.error,
              onAction: () => deleteJournal.mutate(note.id),
            },
          ]}
        >
          <PressableCard
            onPress={() => router.push(`/(main)/notes/${note.id}`)}
            onLongPress={handleLongPress}
          >
            {/* Title */}
            <Text style={styles.noteTitle} numberOfLines={1}>
              {note.title || "Untitled"}
            </Text>

            {/* Preview */}
            {preview ? (
              <Text style={styles.notePreview} numberOfLines={3}>
                {preview}
              </Text>
            ) : null}

            {/* Meta: type badge + date + project */}
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
    },
    [router, deleteJournal],
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredNotes}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ProjectPills
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />
            <View style={styles.searchRow}>
              <FileText size={15} color={colors.text.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search notes..."
                placeholderTextColor={colors.text.muted}
                style={styles.searchInput}
              />
            </View>
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    paddingVertical: 10,
  },
  listContent: {
    paddingHorizontal: 16,
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
    fontSize: 11,
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
    fontSize: 11,
    color: colors.accent.indigo,
    fontWeight: "500",
  },
});
