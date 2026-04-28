import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AudioPlayer } from "./audio-player";
import { useDraftPoll } from "~/hooks/use-draft-poll";
import { useCommitSave } from "~/hooks/use-commit-save";
import { useRecorderStore } from "~/stores/recorder-store";
import { colors } from "~/styles/colors";

function makeDefaultTitle(): string {
  return `Voice note · ${new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function AudioReview({
  id,
  durationSeconds,
  processingStatus,
  localFileUri,
  onDelete,
}: {
  id: string;
  durationSeconds: number;
  processingStatus?: string;
  localFileUri: string | null;
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const eager = processingStatus
    ? processingStatus !== "deferred"
    : durationSeconds <= 60;

  const draftPoll = useDraftPoll(id, eager);
  const commit = useCommitSave();

  const uploadState = useRecorderStore((s) => s.uploadState);
  const uploadProgress = useRecorderStore((s) => s.uploadProgress);
  const reset = useRecorderStore((s) => s.reset);

  // Keep a stable reference to the initial default title for comparison.
  const defaultTitle = useRef(makeDefaultTitle()).current;
  const [title, setTitle] = useState(defaultTitle);
  const [pendingSave, setPendingSave] = useState(false);

  // Fire commit once upload completes if user already tapped Save.
  useEffect(() => {
    if (pendingSave && uploadState === "done") {
      commit.mutate(
        { id, title },
        {
          onSuccess: () => {
            reset();
            router.back();
          },
        },
      );
      setPendingSave(false);
    }
  }, [pendingSave, uploadState, id, title, commit, reset, router]);

  // Replace placeholder title with LLM-generated title once eager processing yields one.
  const data = draftPoll.data;
  useEffect(() => {
    if (
      data?.source_title &&
      data.source_title !== defaultTitle &&
      title === defaultTitle
    ) {
      setTitle(data.source_title);
    }
  }, [data, defaultTitle, title]);

  const onSave = () => {
    if (uploadState === "done") {
      commit.mutate(
        { id, title },
        {
          onSuccess: () => {
            reset();
            router.back();
          },
        },
      );
    } else {
      setPendingSave(true);
    }
  };

  const onDiscard = () => {
    Alert.alert("Discard recording?", undefined, [
      { text: "Keep", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await onDelete(id);
          reset();
          router.back();
        },
      },
    ]);
  };

  const playerSrc = data?.media_url ?? localFileUri ?? "";
  const transcript = data?.extracted_text;
  const showTranscript = !!transcript;
  const showTranscriptPlaceholder = !showTranscript && !eager;
  const showTranscriptSpinner = !showTranscript && eager;
  const isSaving = commit.isPending || pendingSave;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.titleInput}
          multiline
          placeholder="Voice note title"
          placeholderTextColor={colors.text.muted}
        />

        {!!playerSrc && <AudioPlayer source={playerSrc} />}

        <View style={styles.transcriptCard}>
          {showTranscriptSpinner && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent.indigo} />
              <Text style={styles.muted}>Generating transcript…</Text>
            </View>
          )}
          {showTranscriptPlaceholder && (
            <Text style={styles.muted}>
              Transcript will be generated after you save.
            </Text>
          )}
          {showTranscript && (
            <Text style={styles.transcript}>{transcript}</Text>
          )}
        </View>

        {uploadState === "uploading" && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(uploadProgress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.muted}>Uploading…</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          onPress={onDiscard}
          style={[styles.btn, styles.discardBtn]}
          disabled={isSaving}
        >
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          style={[styles.btn, styles.saveBtn, isSaving && styles.saveBtnBusy]}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>{isSaving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { padding: 24, gap: 24 },
  titleInput: {
    fontSize: 24,
    color: colors.text.primary,
    fontWeight: "500",
    lineHeight: 32,
  },
  transcriptCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
  },
  transcript: { fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  muted: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: "center",
  },
  center: { alignItems: "center", gap: 8, padding: 12 },
  progressRow: { gap: 8 },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border.subtle,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 3, backgroundColor: colors.accent.indigo },
  actions: {
    flexDirection: "row",
    gap: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  discardBtn: { backgroundColor: colors.bg.elevated },
  saveBtn: { backgroundColor: colors.accent.indigo },
  saveBtnBusy: { opacity: 0.6 },
  discardText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "500",
  },
  saveText: { color: colors.bg.primary, fontSize: 16, fontWeight: "600" },
});
