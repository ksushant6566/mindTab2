import { View, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { colors } from "~/styles/colors";
import { useAuth } from "~/hooks/use-auth";

export function HeaderRight() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View className="flex-row items-center mr-4 gap-3">
      {/* Search */}
      <Pressable onPress={() => router.push("/(screens)/command-palette")} className="p-1">
        <Search size={20} color={colors.foreground} />
      </Pressable>

      {/* Avatar */}
      {user?.image ? (
        <Pressable onPress={() => router.push("/(screens)/profile" as any)}>
          <Image
            source={{ uri: user.image }}
            className="w-7 h-7 rounded-full"
          />
        </Pressable>
      ) : null}
    </View>
  );
}
