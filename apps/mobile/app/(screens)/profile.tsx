import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  tasksQueryOptions,
  notesQueryOptions,
} from "@mindtab/core";
import { api } from "~/lib/api-client";
import { useAuth } from "~/hooks/use-auth";
import { X, LogOut } from "lucide-react-native";
import { colors } from "~/styles/colors";
import Constants from "expo-constants";

// -- Streak tier ring color --

// -- Screen --

export default function ProfileModal() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: tasks = [] } = useQuery(tasksQueryOptions(api));
  const { data: notes = [] } = useQuery(notesQueryOptions(api));

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      {/* Handle indicator */}
      <View style={styles.handleRow}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeButton}
        >
          <X size={22} color={colors.text.secondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <View
            style={[
              styles.avatarRing,
              { borderColor: colors.border.default },
            ]}
          >
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.statLabel}>Tasks</Text>
          <Text style={styles.statValue}>{(tasks as any[]).length}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.statLabel}>Notes</Text>
          <Text style={styles.statValue}>{(notes as any[]).length}</Text>
        </View>

        {/* Sign out button */}
        <Pressable onPress={handleSignOut} style={styles.signOutRow}>
          <LogOut size={20} color={colors.feedback.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* App version */}
        <Text style={styles.version}>MindTab v{appVersion}</Text>
      </ScrollView>
    </View>
  );
}

// -- Styles --

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // Handle
  handleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text.muted,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },

  // Avatar
  avatarSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 28,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarFallback: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text.primary,
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.text.muted,
  },

  // Card
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 16,
    marginBottom: 14,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text.primary,
  },

  // Sign out
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    marginTop: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.feedback.error,
  },

  // Version
  version: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 24,
  },
});
