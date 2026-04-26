import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useCallback } from "react";

import { AudioRecorder } from "~/components/audio/audio-recorder";
import { colors } from "~/styles/colors";

export default function RecordScreen() {
  const router = useRouter();

  // Upload + draft creation will be wired in Chunk 11 via the upload hook.
  // For now, the route just navigates back when the recorder reports stopped.
  // Chunk 11 replaces this with router.replace(`/saves/review/${id}`).
  const onStop = useCallback(
    (_out: { fileUri: string; durationSeconds: number }) => {
      // TODO(Chunk 11): kick off upload and replace with /saves/review/[id]
      router.back();
    },
    [router],
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
