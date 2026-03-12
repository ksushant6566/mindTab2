import { View, Text } from "react-native";
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected ?? true));
    });
  }, []);

  if (!isOffline) return null;

  return (
    <View className="bg-amber-900/80 flex-row items-center justify-center py-1.5 px-4">
      <WifiOff size={14} color="#fbbf24" />
      <Text className="text-amber-200 text-xs font-medium ml-2">
        You're offline — showing cached data
      </Text>
    </View>
  );
}
