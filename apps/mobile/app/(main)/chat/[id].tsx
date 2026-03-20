import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { colors } from "~/styles/colors";

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.text.primary }}>Conversation {id}</Text>
    </View>
  );
}
