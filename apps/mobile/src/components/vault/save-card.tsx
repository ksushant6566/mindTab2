import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, Loader } from "lucide-react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
};

export type SaveCardProps = {
  id: string;
  sourceType: "article" | "image";
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceThumbnailUrl?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  mediaKey?: string | null;
  processingStatus: string;
  onPress: (id: string) => void;
};

export function SaveCard({
  id,
  sourceType,
  sourceTitle,
  sourceUrl,
  sourceThumbnailUrl,
  summary,
  tags,
  mediaKey,
  processingStatus,
  onPress,
}: SaveCardProps) {
  const isProcessing = processingStatus !== "completed" && processingStatus !== "failed";

  if (isProcessing) {
    return (
      <Pressable onPress={() => onPress(id)} style={[styles.card, styles.processingCard]}>
        <View style={styles.processingRow}>
          <Loader size={12} color="#555555" />
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
    const imageUri = mediaKey ? `${API_URL}/media/${mediaKey}` : null;
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
          <Link size={10} color="#555555" />
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
    marginBottom: 10,
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
    color: "#555555",
    fontSize: 11,
  },
  processingUrl: {
    color: "#888888",
    fontSize: 13,
  },
  articleThumbnail: {
    width: "100%",
    height: 110,
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
    color: "#555555",
    fontSize: 10,
  },
  content: {
    padding: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  title: {
    color: "#e0e0e0",
    fontSize: 13,
    fontWeight: "500",
  },
  snippet: {
    color: "#555555",
    fontSize: 11,
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
    color: "#666666",
    fontSize: 10,
  },
});
