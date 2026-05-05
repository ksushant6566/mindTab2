import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  Linking,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, Trash2, Play } from "lucide-react-native";
import { toast } from "sonner-native";
import { api } from "~/lib/api-client";
import { MarkdownContent } from "~/components/vault/markdown-content";
import { AudioPlayer } from "~/components/audio/audio-player";
import { colors } from "~/styles/colors";

// ── Types ──────────────────────────────────────────────────────────────────────

type SaveDetail = {
  id: string;
  source_url?: string | null;
  source_type: "article" | "image" | "youtube" | "audio" | "instagram_reel";
  source_title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  key_topics?: string[] | null;
  media_url?: string | null;
  media_mime?: string | null;
  media_file_bytes?: number | null;
  duration_seconds?: number | null;
  processing_status: "deferred" | "pending" | "processing" | "completed" | "failed";
  commit_status: "draft" | "committed";
  processing_error?: string | null;
  extracted_text?: string | null;
  visual_description?: string | null;
  created_at: string;
  updated_at: string;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
  transcript_source?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extractDomain(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function VaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: save, isLoading } = useQuery<SaveDetail>({
    queryKey: ["saves", id],
    queryFn: async () => {
      const { data, error } = await (api as any).GET("/saves/{id}", {
        params: { path: { id } },
      });
      if (error) throw new Error("Failed to fetch save");
      return data as SaveDetail;
    },
    enabled: !!id,
  });

  const handleDelete = async () => {
    await (api as any).DELETE("/saves/{id}", {
      params: { path: { id } },
    });
    queryClient.invalidateQueries({ queryKey: ["saves"] });
    toast.success("Deleted");
    router.back();
  };

  const handleShare = async () => {
    if (save?.source_url) {
      await Linking.openURL(save.source_url);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Vault",
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable onPress={handleShare} hitSlop={8} style={styles.headerBtn}>
                <Share2 size={20} color={colors.text.primary} />
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={8} style={styles.headerBtn}>
                <Trash2 size={20} color={colors.feedback.error} />
              </Pressable>
            </View>
          ),
        }}
      />

      <View style={styles.screen}>
        {isLoading || !save ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text.muted} />
          </View>
        ) : save.source_type === "audio" ? (
          <ScrollView
            style={styles.root}
            contentContainerStyle={styles.audioContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.audioPlayerHeader}>
              {save.media_url ? (
                <AudioPlayer source={`${API_URL}${save.media_url}`} />
              ) : null}
              <Text style={styles.audioTitle}>
                {save.source_title ?? "Voice note"}
              </Text>
            </View>
            <View style={{ padding: 16 }}>
              {save.extracted_text ? (
                <Text style={styles.transcript}>{save.extracted_text}</Text>
              ) : (
                <Text style={styles.muted}>
                  Transcript will appear here once processing finishes.
                </Text>
              )}
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Image (image saves) ── */}
            {save.source_type === "image" && save.media_url ? (
              <Image
                source={{ uri: `${API_URL}${save.media_url}` }}
                style={styles.coverImage}
                resizeMode="contain"
              />
            ) : null}

            {/* ── Video cover ── */}
            {save.source_type === "youtube" || save.source_type === "instagram_reel" ? (
              <View style={styles.ytCoverWrapper}>
                {save.video_thumbnail_url ? (
                  <Image
                    source={{ uri: save.video_thumbnail_url }}
                    style={styles.ytCoverImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.ytCoverImage, styles.ytCoverPlaceholder]} />
                )}
                <View style={styles.ytPlayOverlay}>
                  <Play size={28} color="#ffffff" fill="#ffffff" />
                </View>
                {save.duration_seconds != null ? (
                  <View style={styles.ytDurationBadge}>
                    <Text style={styles.ytDurationText}>{formatDuration(save.duration_seconds)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── Source row (articles only) ── */}
            {save.source_type === "article" && save.source_url ? (
              <View style={styles.sourceRow}>
                <View style={styles.favicon} />
                <Text style={styles.sourceDomain} numberOfLines={1}>
                  {extractDomain(save.source_url)}
                </Text>
              </View>
            ) : null}

            {/* ── Title ── */}
            {save.source_title ? (
              <Text style={styles.title}>{save.source_title}</Text>
            ) : null}

            {/* ── Channel (YouTube) ── */}
            {(save.source_type === "youtube" || save.source_type === "instagram_reel") && save.video_channel ? (
              <Text style={styles.channelName}>{save.video_channel}</Text>
            ) : null}

            {/* ── Key topics ── */}
            {save.key_topics && save.key_topics.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>KEY TOPICS</Text>
                {save.key_topics.map((topic) => (
                  <View key={topic} style={styles.bulletRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.bulletText}>{topic}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ── Summary ── */}
            {save.summary ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SUMMARY</Text>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryText}>{save.summary}</Text>
                </View>
              </View>
            ) : null}

            {/* ── Tags ── */}
            {save.tags && save.tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {save.tags.map((tag) => (
                  <View key={tag} style={styles.tagPill}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ── Open Original button ── */}
            {(save.source_type === "article" || save.source_type === "youtube" || save.source_type === "instagram_reel") && save.source_url ? (
              <Pressable
                style={styles.openBtn}
                onPress={() => Linking.openURL(save.source_url!)}
              >
                <Text style={styles.openBtnText}>
                  {save.source_type === "youtube"
                    ? "Watch on YouTube ↗"
                    : save.source_type === "instagram_reel"
                      ? "Open on Instagram ↗"
                      : "Open Original Article ↗"}
                </Text>
              </Pressable>
            ) : null}

            {/* ── Extracted content ── */}
            {save.extracted_text ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ARTICLE</Text>
                <MarkdownContent content={save.extracted_text} />
              </View>
            ) : null}

            {/* ── Visual description (images) ── */}
            {save.source_type === "image" && save.visual_description ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DESCRIPTION</Text>
                <Text style={styles.extractedText}>{save.visual_description}</Text>
              </View>
            ) : null}

            {/* ── Transcript source footer (videos) ── */}
            {save.source_type === "youtube" || save.source_type === "instagram_reel" ? (
              <Text style={styles.transcriptFooter}>
                Transcript:{" "}
                {save.transcript_source === "whisper"
                  ? "Whisper transcription"
                  : save.source_type === "youtube"
                    ? "YouTube captions"
                    : "captions"}
              </Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  audioContent: {
    paddingBottom: 80,
  },
  audioPlayerHeader: {
    backgroundColor: colors.bg.primary,
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  audioTitle: {
    fontSize: 22,
    color: colors.text.primary,
    fontWeight: "500",
  },
  transcript: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 24,
  },
  muted: {
    fontSize: 14,
    color: colors.text.secondary,
    fontStyle: "italic",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    padding: 4,
    marginLeft: 8,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  // Image
  coverImage: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: "#1a1a1a",
  },
  // Source row
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  favicon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: "#1a1a1a",
  },
  sourceDomain: {
    color: colors.text.dim,
    fontSize: 12,
  },
  // Title
  title: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28.6,
    marginBottom: 14,
  },
  // Tags
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  tagPill: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: colors.text.dim,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  // Summary card
  summaryCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    padding: 14,
  },
  summaryText: {
    color: "#cccccc",
    fontSize: 14,
    lineHeight: 23.8,
  },
  // Key topics
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text.dim,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: "#bbbbbb",
    fontSize: 14,
  },
  // Extracted content
  extractedText: {
    color: "#999999",
    fontSize: 12,
    lineHeight: 22.1,
  },
  // YouTube cover
  ytCoverWrapper: {
    position: "relative",
    width: "100%",
    height: 210,
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  ytCoverImage: {
    width: "100%",
    height: 210,
  },
  ytCoverPlaceholder: {
    backgroundColor: "#1a1a1a",
  },
  ytPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  ytDurationBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ytDurationText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  // Channel name
  channelName: {
    color: colors.text.dim,
    fontSize: 13,
    marginTop: -10,
    marginBottom: 14,
  },
  // Transcript footer
  transcriptFooter: {
    color: colors.text.dim,
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
  // Open button
  openBtn: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  openBtnText: {
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
