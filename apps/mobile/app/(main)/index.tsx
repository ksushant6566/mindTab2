import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "~/styles/colors";

export default function Dashboard() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: "700" }}>
          Dashboard
        </Text>
        <Text style={{ color: colors.text.secondary, fontSize: 16, marginTop: 8 }}>
          Building in Phase 3...
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
