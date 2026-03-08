import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { PressableCard } from "~/components/ui/pressable-card";
import { colors } from "~/styles/colors";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type NoteCardProps = {
  note: {
    id: string;
    title: string;
    content?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
};

export function NoteCard({ note }: NoteCardProps) {
  const router = useRouter();
  const preview = note.content ? stripHtml(note.content) : "";

  return (
    <PressableCard scaleUp onPress={() => router.push(`/(main)/notes/${note.id}`)}>
      <Text style={styles.noteTitle} numberOfLines={1}>
        {note.title || "Untitled"}
      </Text>
      {preview ? (
        <Text style={styles.notePreview} numberOfLines={2}>
          {preview}
        </Text>
      ) : null}
      {note.updatedAt && (
        <Text style={styles.dateText}>
          {formatDate(note.updatedAt)}
        </Text>
      )}
    </PressableCard>
  );
}

const styles = StyleSheet.create({
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
  dateText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
  },
});
