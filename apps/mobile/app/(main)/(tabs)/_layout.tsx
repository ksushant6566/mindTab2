import { useRef, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { useChatSidebar } from "~/hooks/use-chat-sidebar";
import { colors } from "~/styles/colors";

import ChatTab from "./chat";
import Dashboard from "./index";
import VaultTab from "./vault";

const TABS = ["chat", "index", "vault"] as const;
type Tab = (typeof TABS)[number];

export default function TabsLayout() {
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(1); // Home is default
  const { isOpen, open, close } = useChatSidebar();

  const activeTab = TABS[activeIndex];
  const isChatTab = activeTab === "chat";

  const handleTabChange = useCallback((tab: Tab) => {
    const index = TABS.indexOf(tab);
    pagerRef.current?.setPage(index);
  }, []);

  // Update pill during swipe, not just on settle
  const lastRoundedPage = useRef(1);
  const handlePageScroll = useCallback((e: { nativeEvent: { position: number; offset: number } }) => {
    const { position, offset } = e.nativeEvent;
    const rounded = Math.round(position + offset);
    if (rounded !== lastRoundedPage.current) {
      lastRoundedPage.current = rounded;
      setActiveIndex(rounded);
    }
  }, []);

  return (
    <ChatSidebar isOpen={isChatTab && isOpen} onClose={close}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <DashboardHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onMenuPress={isChatTab ? open : undefined}
        />
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={1}
          onPageScroll={handlePageScroll}
        >
          <View key="chat" style={styles.page}>
            <ChatTab />
          </View>
          <View key="index" style={styles.page}>
            <Dashboard />
          </View>
          <View key="vault" style={styles.page}>
            <VaultTab />
          </View>
        </PagerView>
      </SafeAreaView>
    </ChatSidebar>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
