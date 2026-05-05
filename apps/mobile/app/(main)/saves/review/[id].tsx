import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AudioReview } from "~/components/audio/audio-review";
import { useRecorderStore } from "~/stores/recorder-store";
import { api } from "~/lib/api-client";

export default function ReviewScreen() {
  const { id, durationSeconds: serverDuration, processingStatus } =
    useLocalSearchParams<{
      id: string;
      durationSeconds?: string;
      processingStatus?: string;
    }>();
  const fileUri = useRecorderStore((s) => s.fileUri);
  const elapsedMs = useRecorderStore((s) => s.elapsedMs);
  const localDurationSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const parsedServerDuration =
    typeof serverDuration === "string" ? Number.parseInt(serverDuration, 10) : NaN;
  const durationSeconds =
    Number.isFinite(parsedServerDuration) && parsedServerDuration > 0
      ? parsedServerDuration
      : localDurationSeconds;
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
      processingStatus={typeof processingStatus === "string" ? processingStatus : undefined}
      localFileUri={fileUri}
      onDelete={handleDelete}
    />
  );
}
