import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "~/components/ui/card";

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
    <Pressable onPress={() => router.push(`/(tabs)/notes/${note.id}`)}>
      <Card className="mb-2">
        <Text className="text-foreground font-medium" numberOfLines={1}>
          {note.title || "Untitled"}
        </Text>
        {preview ? (
          <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {note.updatedAt && (
          <Text className="text-muted-foreground text-xs mt-2">
            {formatDate(note.updatedAt)}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
