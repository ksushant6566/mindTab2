import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailSignupScreen() {
  const { emailSignup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      await emailSignup(email.trim(), password, name.trim());
      router.push({
        pathname: "/(auth)/email-verify",
        params: { email: email.trim(), password, name: name.trim() },
      });
    } catch (error: any) {
      toast.error(error.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
          Create account
        </Text>
        <Text className="text-muted-foreground mb-8">
          Sign up with your email address
        </Text>

        <TextInput
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

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
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleSignup}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">
              Create account
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
