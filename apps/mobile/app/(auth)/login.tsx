import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
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

      <View className="flex-row items-center w-full max-w-xs my-6">
        <View className="flex-1 h-px bg-neutral-700" />
        <Text className="text-muted-foreground mx-4 text-sm">or</Text>
        <View className="flex-1 h-px bg-neutral-700" />
      </View>

      <Pressable
        onPress={() => router.push("/(auth)/email-signup")}
        className="items-center justify-center border border-neutral-700 rounded-lg px-6 py-3 w-full max-w-xs mb-3"
      >
        <Text className="text-foreground font-semibold text-base">
          Sign up with email
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(auth)/email-signin")}
        className="items-center justify-center px-6 py-3 w-full max-w-xs"
      >
        <Text className="text-muted-foreground text-base">
          Sign in with email
        </Text>
      </Pressable>
    </View>
  );
}
