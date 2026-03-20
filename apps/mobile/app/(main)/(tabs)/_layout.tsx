import { Tabs, usePathname, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { colors } from "~/styles/colors";

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab = pathname.includes("/chat")
    ? "chat"
    : pathname.includes("/vault")
    ? "vault"
    : "index";

  const handleTabChange = (tab: "chat" | "index" | "vault") => {
    if (tab === "index") {
      router.replace("/");
    } else {
      router.replace(`/${tab}` as "/(main)/(tabs)/chat" | "/(main)/(tabs)/vault");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={["top"]}>
      <DashboardHeader activeTab={activeTab} onTabChange={handleTabChange} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      >
        <Tabs.Screen name="chat" options={{ title: "Chat" }} />
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="vault" options={{ title: "Vault" }} />
      </Tabs>
    </SafeAreaView>
  );
}
