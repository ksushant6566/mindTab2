import { Tabs, usePathname, useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { useChatSidebar } from "~/hooks/use-chat-sidebar";
import { colors } from "~/styles/colors";

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, open, close } = useChatSidebar();

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

  const isChatTab = activeTab === "chat";

  return (
    <ChatSidebar isOpen={isChatTab && isOpen} onClose={close}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <DashboardHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onMenuPress={isChatTab ? open : undefined}
        />
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
    </ChatSidebar>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
});
