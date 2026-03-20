import { View, Text } from "react-native";
import { colors } from "~/styles/colors";

export default function ChatTab() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.text.primary }}>Chat (coming soon)</Text>
    </View>
  );
}
