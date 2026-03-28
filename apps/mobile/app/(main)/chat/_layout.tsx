import { Stack } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { Menu } from "lucide-react-native";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { useChatSidebar } from "~/hooks/use-chat-sidebar";
import { useChatStore } from "~/hooks/use-chat-store";
import { colors } from "~/styles/colors";

export default function ChatLayout() {
  const { isOpen, open, close } = useChatSidebar();
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  return (
    <ChatSidebar isOpen={isOpen} onClose={close} activeConversationId={activeConversationId}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen
          name="[id]"
          options={{
            headerShown: true,
            title: "Conversation",
            headerLeft: () => (
              <Pressable onPress={open} style={styles.menuButton}>
                <Menu size={22} color={colors.text.secondary} />
              </Pressable>
            ),
          }}
        />
      </Stack>
    </ChatSidebar>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    marginRight: 8,
    padding: 4,
  },
});
