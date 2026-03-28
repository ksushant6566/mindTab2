import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailSigninScreen() {
  const { emailSignin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignin = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!password) {
      toast.error("Password is required");
      return;
    }

    try {
      setIsLoading(true);
      await emailSignin(email.trim(), password);
      // AuthGuard will redirect
    } catch (error: any) {
      toast.error(error.message || "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        className="px-8"
      >
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Sign in
        </Text>
        <Text className="text-muted-foreground mb-8">
          Sign in with your email address
        </Text>

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleSignin}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3 mb-4"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">Sign in</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/forgot-password")}
          className="items-center py-2"
        >
          <Text className="text-muted-foreground text-sm">
            Forgot password?
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
