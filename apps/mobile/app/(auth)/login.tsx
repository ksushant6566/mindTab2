import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";

export default function LoginScreen() {
  const { login } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    try {
      setIsSigningIn(true);
      await login();
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-4xl font-bold text-foreground mb-2">MindTab</Text>
      <Text className="text-muted-foreground text-center mb-12">
        Track goals, build habits, capture thoughts.
      </Text>

      <Pressable
        onPress={handleLogin}
        disabled={isSigningIn}
        className="flex-row items-center justify-center bg-white rounded-lg px-6 py-3 w-full max-w-xs"
      >
        {isSigningIn ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text className="text-black font-semibold text-base">
            Sign in with Google
          </Text>
        )}
      </Pressable>
    </View>
  );
}
