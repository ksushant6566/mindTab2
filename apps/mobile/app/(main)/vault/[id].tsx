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
import { useState, useEffect } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, Trash2 } from "lucide-react-native";
import { toast } from "sonner-native";
import { api } from "~/lib/api-client";
import { getAccessToken } from "~/lib/auth";
import { colors } from "~/styles/colors";

// ── Types ──────────────────────────────────────────────────────────────────────

type SaveDetail = {
  id: string;
  source_url?: string | null;
  source_type: "article" | "image";
  source_title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  key_topics?: string[] | null;
  media_key?: string | null;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_error?: string | null;
  extracted_text?: string | null;
  visual_description?: string | null;
  created_at: string;
  updated_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractDomain(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

function getMediaUrl(mediaKey: string): string {
  return `${API_URL}/media/${mediaKey}`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function VaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    getAccessToken().then(setAccessToken);
  }, []);

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
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Image (image saves) ── */}
            {save.source_type === "image" && save.media_key ? (
              <Image
                source={{
                  uri: getMediaUrl(save.media_key),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                }}
                style={styles.coverImage}
                resizeMode="contain"
              />
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

            {/* ── Summary ── */}
            {save.summary ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SUMMARY</Text>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryText}>{save.summary}</Text>
                </View>
              </View>
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

            {/* ── Extracted content ── */}
            {save.extracted_text ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>EXTRACTED CONTENT</Text>
                <Text style={styles.extractedText}>{save.extracted_text}</Text>
              </View>
            ) : null}

            {/* ── Visual description (images) ── */}
            {save.source_type === "image" && save.visual_description ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DESCRIPTION</Text>
                <Text style={styles.extractedText}>{save.visual_description}</Text>
              </View>
            ) : null}

            {/* ── Open Original Article button ── */}
            {save.source_type === "article" && save.source_url ? (
              <Pressable
                style={styles.openBtn}
                onPress={() => Linking.openURL(save.source_url!)}
              >
                <Text style={styles.openBtnText}>Open Original Article ↗</Text>
              </Pressable>
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
    color: "#555555",
    fontSize: 12,
  },
  // Title
  title: {
    color: "#fafafa",
    fontSize: 22,
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
    color: "#888888",
    fontSize: 12,
  },
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: "#555555",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  // Summary card
  summaryCard: {
    backgroundColor: "#111111",
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
    backgroundColor: "#555555",
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
    fontSize: 13,
    lineHeight: 22.1,
  },
  // Open button
  openBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  openBtnText: {
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
