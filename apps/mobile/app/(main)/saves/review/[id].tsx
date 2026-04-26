import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AudioReview } from "~/components/audio/audio-review";
import { useRecorderStore } from "~/stores/recorder-store";
import { api } from "~/lib/api-client";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fileUri = useRecorderStore((s) => s.fileUri);
  const elapsedMs = useRecorderStore((s) => s.elapsedMs);
  const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const queryClient = useQueryClient();

  if (!id || typeof id !== "string") return null;

  const handleDelete = async (rowId: string) => {
    await (api as any).DELETE("/saves/{id}", {
      params: { path: { id: rowId } },
    });
    queryClient.invalidateQueries({ queryKey: ["saves"] });
    queryClient.invalidateQueries({ queryKey: ["save", rowId] });
  };

  return (
    <AudioReview
      id={id}
      durationSeconds={durationSeconds}
      localFileUri={fileUri}
      onDelete={handleDelete}
    />
  );
}
