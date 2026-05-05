import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, Loader, Play } from "lucide-react-native";
import { colors } from "~/styles/colors";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
};

export type SaveCardProps = {
  id: string;
  sourceType: "article" | "image" | "youtube" | "audio" | "instagram_reel";
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceThumbnailUrl?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  mediaUrl?: string | null;
  processingStatus: string;
  onPress: (id: string) => void;
  videoDuration?: number;
  videoThumbnailUrl?: string;
  videoChannel?: string;
};

export function SaveCard({
  id,
  sourceType,
  sourceTitle,
  sourceUrl,
  sourceThumbnailUrl,
  summary,
  tags,
  mediaUrl,
  processingStatus,
  onPress,
  videoDuration,
  videoThumbnailUrl,
  videoChannel,
}: SaveCardProps) {
  const isProcessing = processingStatus !== "completed" && processingStatus !== "failed";

  if (isProcessing) {
    return (
      <Pressable onPress={() => onPress(id)} style={[styles.card, styles.processingCard]}>
        <View style={styles.processingRow}>
          <Loader size={12} color={colors.text.dim} />
          <Text style={styles.processingText}>Processing...</Text>
        </View>
        {sourceUrl ? (
          <Text style={styles.processingUrl} numberOfLines={2}>
            {getDomain(sourceUrl) || sourceUrl}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  if (sourceType === "image") {
    const imageUri = mediaUrl ? `${API_URL}${mediaUrl}` : null;
    return (
      <Pressable onPress={() => onPress(id)} style={styles.card}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imageThumbnail} resizeMode="cover" />
        ) : null}
        <View style={styles.content}>
          {sourceTitle ? (
            <Text style={styles.title} numberOfLines={2}>
              {sourceTitle}
            </Text>
          ) : null}
          {summary ? (
            <Text style={styles.snippet} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
          {tags && tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  if (sourceType === "youtube" || sourceType === "instagram_reel") {
    const isInstagram = sourceType === "instagram_reel";
    return (
      <Pressable onPress={() => onPress(id)} style={styles.card}>
        <View style={styles.youtubeThumbnailWrapper}>
          {videoThumbnailUrl ? (
            <Image
              source={{ uri: videoThumbnailUrl }}
              style={styles.youtubeThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.youtubeThumbnail, styles.youtubeThumbnailPlaceholder]} />
          )}
          <View style={isInstagram ? styles.igBadge : styles.ytBadge}>
            <Text style={styles.ytBadgeText}>{isInstagram ? "IG" : "YT"}</Text>
          </View>
          <View style={styles.playOverlay}>
            <Play size={18} color="#ffffff" fill="#ffffff" />
          </View>
          {videoDuration != null ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(videoDuration)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.content}>
          {sourceTitle ? (
            <Text style={styles.title} numberOfLines={2}>
              {sourceTitle}
            </Text>
          ) : null}
          {videoChannel ? (
            <Text style={styles.channelText} numberOfLines={1}>
              {videoChannel}
            </Text>
          ) : null}
          {summary ? (
            <Text style={styles.snippet} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
          {tags && tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // Article card
  return (
    <Pressable onPress={() => onPress(id)} style={styles.card}>
      {sourceThumbnailUrl ? (
        <Image
          source={{ uri: sourceThumbnailUrl }}
          style={styles.articleThumbnail}
          resizeMode="cover"
        />
      ) : sourceUrl ? (
        <View style={styles.domainRow}>
          <Link size={10} color={colors.text.dim} />
          <Text style={styles.domainText}>{getDomain(sourceUrl)}</Text>
        </View>
      ) : null}
      <View style={styles.content}>
        {sourceTitle ? (
          <Text style={styles.title} numberOfLines={2}>
            {sourceTitle}
          </Text>
        ) : null}
        {summary ? (
          <Text style={styles.snippet} numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
        {tags && tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    overflow: "hidden",
  },
  processingCard: {
    opacity: 0.6,
    padding: 12,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  processingText: {
    color: colors.text.dim,
    fontSize: 12,
  },
  processingUrl: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  articleThumbnail: {
    width: "100%",
    height: 110,
  },
  youtubeThumbnailWrapper: {
    position: "relative",
    width: "100%",
    height: 110,
  },
  youtubeThumbnail: {
    width: "100%",
    height: 110,
  },
  youtubeThumbnailPlaceholder: {
    backgroundColor: "#1a1a1a",
  },
  ytBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#ff0000",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  igBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#d62976",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ytBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  durationBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
  },
  channelText: {
    color: colors.text.dim,
    fontSize: 11,
  },
  imageThumbnail: {
    width: "100%",
    height: 140,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  domainText: {
    color: colors.text.dim,
    fontSize: 10,
  },
  content: {
    padding: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  title: {
    color: colors.text.reader,
    fontSize: 14,
    fontWeight: "500",
  },
  snippet: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  tag: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    color: colors.text.muted,
    fontSize: 10,
  },
});
