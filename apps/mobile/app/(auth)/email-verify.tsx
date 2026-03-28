import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailVerifyScreen() {
  const { emailVerify } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    try {
      setIsLoading(true);
      await emailVerify(email!, code);
      // AuthGuard will redirect to onboarding or main
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-background"
    >
      <View className="flex-1 justify-center px-8">
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Verify your email
        </Text>
        <Text className="text-muted-foreground mb-8">
          We sent a 6-digit code to {email}
        </Text>

        <TextInput
          placeholder="000000"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-4 text-foreground text-2xl tracking-widest mb-6"
        />

        <Pressable
          onPress={handleVerify}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3 mb-4"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">Verify</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} className="items-center py-2">
          <Text className="text-muted-foreground text-sm">
            Didn't get a code? Go back and try again
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
