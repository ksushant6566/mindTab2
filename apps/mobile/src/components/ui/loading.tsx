import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "~/styles/colors";

export function Loading() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.text.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg.primary,
  },
});
