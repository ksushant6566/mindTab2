import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import {
  searchGoalsQueryOptions,
  searchHabitsQueryOptions,
  searchJournalsQueryOptions,
} from "@mindtab/core";
import { Target, Repeat, FileText, Search } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { api } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionResult = {
  type: "goal" | "habit" | "note";
  id: string;
  title: string;
};

type MentionSearchSheetProps = {
  onSelect: (mention: MentionResult) => void;
  onDismiss: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MentionSearchSheet = forwardRef<BottomSheet, MentionSearchSheetProps>(
  ({ onSelect, onDismiss }, ref) => {
    const snapPoints = useMemo(() => ["50%", "80%"], []);
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQuery(query), 300);
      return () => clearTimeout(t);
    }, [query]);

    const { data: goals = [] } = useQuery(searchGoalsQueryOptions(api, debouncedQuery));
    const { data: habits = [] } = useQuery(searchHabitsQueryOptions(api, debouncedQuery));
    const { data: notes = [] } = useQuery(searchJournalsQueryOptions(api, debouncedQuery));

    const results: MentionResult[] = useMemo(() => {
      const items: MentionResult[] = [];
      for (const g of goals as any[]) {
        items.push({ type: "goal", id: g.id, title: g.title || "Untitled" });
      }
      for (const h of habits as any[]) {
        items.push({ type: "habit", id: h.id, title: h.name || h.title || "Untitled" });
      }
      for (const n of notes as any[]) {
        items.push({ type: "note", id: n.id, title: n.title || "Untitled" });
      }
      return items;
    }, [goals, habits, notes]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.4}
        />
      ),
      [],
    );

    const typeIcon = (type: "goal" | "habit" | "note") => {
      const size = 16;
      switch (type) {
        case "goal":
          return <Target size={size} color={colors.accent.indigo} />;
        case "habit":
          return <Repeat size={size} color={colors.feedback.success} />;
        case "note":
          return <FileText size={size} color={colors.status.active} />;
      }
    };

    const renderItem = ({ item }: { item: MentionResult }) => (
      <Pressable
        style={({ pressed }) => [
          styles.resultItem,
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => {
          onSelect(item);
          setQuery("");
        }}
      >
        {typeIcon(item.type)}
        <View style={styles.resultTextWrap}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.resultType}>{item.type}</Text>
        </View>
      </Pressable>
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        backdropComponent={renderBackdrop}
        onChange={(index) => {
          if (index === -1) {
            setQuery("");
            onDismiss();
          }
        }}
      >
        <BottomSheetView style={styles.content}>
          {/* Search input */}
          <View style={styles.searchRow}>
            <Search size={18} color={colors.text.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search goals, habits, notes..."
              placeholderTextColor={colors.text.muted}
              style={styles.searchInput}
              autoFocus
            />
          </View>

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.type}:${item.id}`}
            renderItem={renderItem}
            ListEmptyComponent={
              query ? (
                <Text style={styles.emptyText}>No results</Text>
              ) : (
                <Text style={styles.emptyText}>
                  Type to search for goals, habits, or notes
                </Text>
              )
            }
            keyboardShouldPersistTaps="handled"
            style={styles.list}
          />
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

MentionSearchSheet.displayName = "MentionSearchSheet";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: "#404040",
    width: 36,
    height: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    padding: 0,
  },
  list: {
    flex: 1,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  resultTextWrap: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text.primary,
  },
  resultType: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    textTransform: "capitalize",
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    paddingVertical: 24,
  },
});
