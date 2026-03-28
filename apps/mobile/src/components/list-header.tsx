import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "~/hooks/use-auth";
import { colors } from "~/styles/colors";

export type SearchContext = "goals" | "habits" | "notes";

type ListHeaderProps = {
  title: string;
  subtitle?: string;
  searchContext?: SearchContext;
};

export function ListHeader({ title, subtitle, searchContext }: ListHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const initial = (user?.name?.[0] ?? "").toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* Avatar — same size/position as dashboard header */}
        <Pressable onPress={() => router.push("/(screens)/profile")}>
          {user?.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}
        </Pressable>

        {/* Title + subtitle */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>

        {/* Search */}
        <Pressable
          onPress={() =>
            router.push(
              searchContext
                ? { pathname: "/(screens)/command-palette", params: { context: searchContext } }
                : "/(screens)/command-palette" as any,
            )
          }
          style={styles.searchButton}
        >
          <Search size={18} color={colors.text.secondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.bg.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  titleSection: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.muted,
  },
  searchButton: {
    padding: 6,
  },
});
