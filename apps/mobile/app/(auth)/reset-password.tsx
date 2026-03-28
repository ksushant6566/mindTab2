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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function ResetPasswordScreen() {
  const { resetPassword } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (code.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      await resetPassword(email!, code, newPassword);
      toast.success("Password reset successful");
      router.push("/(auth)/email-signin");
    } catch (error: any) {
      toast.error(error.message || "Reset failed");
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
        keyboardDismissMode="interactive"
        className="px-8"
      >
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Set new password
        </Text>
        <Text className="text-muted-foreground mb-8">
          Enter the code sent to {email}
        </Text>

        <TextInput
          placeholder="000000"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-4 text-foreground text-2xl tracking-widest mb-4"
        />

        <TextInput
          placeholder="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleReset}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">
              Reset password
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
