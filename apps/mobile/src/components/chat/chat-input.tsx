import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { Paperclip, Mic, Send, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";

type ChatInputProps = {
  onSend: (text: string, attachments: string[]) => void;
  disabled?: boolean;
};

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachments((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (!hasContent || disabled) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
  };

  return (
    <View style={styles.container}>
      {/* Text Input */}
      <TextInput
        style={styles.textInput}
        placeholder="Ask anything..."
        placeholderTextColor="#444444"
        value={text}
        onChangeText={setText}
        multiline
        editable={!disabled}
      />

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentScroll}
          contentContainerStyle={styles.attachmentContent}
        >
          {attachments.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.attachmentChip}>
              <Image source={{ uri }} style={styles.attachmentImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeAttachment(index)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <X size={10} color="#fafafa" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Action Row */}
      <View style={styles.actionRow}>
        {/* Left group */}
        <View style={styles.leftGroup}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={pickImage}
            disabled={disabled}
          >
            <Paperclip size={18} color="#777777" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Right group */}
        <View style={styles.rightGroup}>
          {/* Mic — non-functional placeholder */}
          <TouchableOpacity style={styles.iconButton} disabled>
            <Mic size={18} color="#777777" strokeWidth={2} />
          </TouchableOpacity>

          {/* Send */}
          <TouchableOpacity
            style={[
              styles.iconButton,
              hasContent ? styles.sendButtonActive : styles.sendButtonInactive,
            ]}
            onPress={handleSend}
            disabled={!hasContent || disabled}
          >
            <Send
              size={16}
              color={hasContent ? "#0a0a0a" : "#666666"}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#222222",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  textInput: {
    color: "#fafafa",
    fontSize: 16,
    maxHeight: 120,
    marginBottom: 12,
    padding: 0,
    textAlignVertical: "top",
  },
  attachmentScroll: {
    marginBottom: 10,
  },
  attachmentContent: {
    gap: 8,
    paddingRight: 4,
  },
  attachmentChip: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: "visible",
    position: "relative",
  },
  attachmentImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#333333",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leftGroup: {
    flexDirection: "row",
    gap: 8,
  },
  rightGroup: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1c1c1c",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonActive: {
    backgroundColor: "#ffffff",
  },
  sendButtonInactive: {
    backgroundColor: "#333333",
  },
});
