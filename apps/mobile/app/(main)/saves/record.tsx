import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useCallback } from "react";

import { AudioRecorder } from "~/components/audio/audio-recorder";
import { useAudioUpload } from "~/hooks/use-audio-upload";
import { colors } from "~/styles/colors";

export default function RecordScreen() {
  const router = useRouter();
  const upload = useAudioUpload();

  const onStop = useCallback(
    async ({ fileUri, durationSeconds }: { fileUri: string; durationSeconds: number }) => {
      try {
        const result = await upload.mutateAsync({
          fileUri,
          autoCommit: false,
          source: "recorder",
        });
        router.replace({
          pathname: "/saves/review/[id]",
          params: {
            id: result.id,
            processingStatus: result.processing_status,
            durationSeconds: String(result.duration_seconds ?? durationSeconds),
          },
        } as any);
      } catch (err) {
        console.warn("audio upload failed", err);
        router.back();
      }
    },
    [router, upload],
  );

  return (
    <View style={styles.root}>
      <AudioRecorder onStop={onStop} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
});
