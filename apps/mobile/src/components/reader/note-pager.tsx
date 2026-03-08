import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import PagerView from "react-native-pager-view";
import type { PagerViewOnPageSelectedEvent } from "react-native-pager-view";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SharedValue } from "react-native-reanimated";
import {
  journalQueryOptions,
  journalsQueryOptions,
} from "@mindtab/core";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "~/lib/api-client";
import { colors } from "~/styles/colors";
import { ReaderPage, type ReaderNote } from "./reader-page";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotePagerProps = {
  currentId: string;
  filterProjectId?: string;
  onToggleHeader: () => void;
  onMentionPress: (type: string, id: string, label: string) => void;
  dismissTranslateY: SharedValue<number>;
  headerVisible: SharedValue<number>;
  onDismiss: () => void;
  /** Disable horizontal paging (e.g., while editing) */
  scrollEnabled?: boolean;
};

// ---------------------------------------------------------------------------
// Per-page wrapper — only fetches data when near the active page
// ---------------------------------------------------------------------------

function PagerPageContent({
  noteId,
  isNear,
  onToggleHeader,
  onMentionPress,
  dismissTranslateY,
  headerVisible,
  onDismiss,
}: {
  noteId: string;
  isNear: boolean;
  onToggleHeader: () => void;
  onMentionPress: (type: string, id: string, label: string) => void;
  dismissTranslateY: SharedValue<number>;
  headerVisible: SharedValue<number>;
  onDismiss: () => void;
}) {
  const { data: note } = useQuery({
    ...journalQueryOptions(api, noteId),
    enabled: isNear,
  });

  if (!note) return <View style={styles.placeholder} />;

  return (
    <ReaderPage
      note={note as ReaderNote}
      onToggleHeader={onToggleHeader}
      onMentionPress={onMentionPress}
      dismissTranslateY={dismissTranslateY}
      headerVisible={headerVisible}
      onDismiss={onDismiss}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotePager({
  currentId,
  filterProjectId,
  onToggleHeader,
  onMentionPress,
  dismissTranslateY,
  headerVisible,
  onDismiss,
  scrollEnabled = true,
}: NotePagerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pagerRef = useRef<PagerView>(null);
  const isInternalChange = useRef(false);

  // Track active note — state drives re-renders, ref prevents stale closures
  const [activeId, setActiveId] = useState(currentId);
  const activeIdRef = useRef(currentId);

  // Fetch the full sorted note list for paging
  const { data: allNotes } = useQuery(
    journalsQueryOptions(api, {
      projectId: filterProjectId || undefined,
    }),
  );

  const sortedNotes = useMemo(() => {
    if (!allNotes) return [];
    return [...allNotes].sort((a, b) => {
      const aDate = (a as any).updatedAt ?? (a as any).createdAt ?? "";
      const bDate = (b as any).updatedAt ?? (b as any).createdAt ?? "";
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [allNotes]);

  const noteIds = useMemo(
    () => sortedNotes.map((n: any) => n.id as string),
    [sortedNotes],
  );

  // Derive page indices from IDs
  const currentIndex = noteIds.indexOf(currentId);
  const activePageIndex = noteIds.indexOf(activeId);
  const effectiveIndex =
    activePageIndex >= 0 ? activePageIndex : currentIndex;

  // Prefetch neighbors of the active note
  useEffect(() => {
    const idx = noteIds.indexOf(activeId);
    if (idx > 0)
      queryClient.prefetchQuery(journalQueryOptions(api, noteIds[idx - 1]));
    if (idx >= 0 && idx < noteIds.length - 1)
      queryClient.prefetchQuery(journalQueryOptions(api, noteIds[idx + 1]));
  }, [activeId, noteIds, queryClient]);

  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const selectedIndex = event.nativeEvent.position;
      const selectedId = noteIds[selectedIndex];
      if (!selectedId || selectedId === activeIdRef.current) return;

      isInternalChange.current = true;
      activeIdRef.current = selectedId;
      setActiveId(selectedId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.setParams({ id: selectedId });
    },
    [noteIds, router],
  );

  // Sync with external id changes (e.g., deep link navigation).
  // Skip if the change was initiated internally via swipe.
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (currentId !== activeIdRef.current) {
      const idx = noteIds.indexOf(currentId);
      if (idx >= 0) {
        activeIdRef.current = currentId;
        setActiveId(currentId);
        pagerRef.current?.setPageWithoutAnimation(idx);
      }
    }
  }, [currentId, noteIds]);

  // Wait for note list to include the current note
  if (currentIndex < 0) return null;

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={currentIndex}
      onPageSelected={handlePageSelected}
      offscreenPageLimit={1}
      overdrag={false}
      scrollEnabled={scrollEnabled}
    >
      {noteIds.map((noteId, index) => (
        <View key={noteId} style={styles.page}>
          <PagerPageContent
            noteId={noteId}
            isNear={Math.abs(index - effectiveIndex) <= 1}
            onToggleHeader={onToggleHeader}
            onMentionPress={onMentionPress}
            dismissTranslateY={dismissTranslateY}
            headerVisible={headerVisible}
            onDismiss={onDismiss}
          />
        </View>
      ))}
    </PagerView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
});
