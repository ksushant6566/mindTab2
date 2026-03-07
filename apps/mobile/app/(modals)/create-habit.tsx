import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import { useCreateHabit } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { colors } from "~/styles/colors";
import { toast } from "sonner-native";

const quickPicks = ["Exercise", "Read", "Water", "Meditate", "Write", "Sleep"];

export default function CreateHabitModal() {
  const router = useRouter();
  const createHabit = useCreateHabit(api);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typeTitle = useCallback((text: string) => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setTitle("");
    let i = 0;
    const tick = () => {
      i++;
      setTitle(text.slice(0, i));
      if (i < text.length) {
        typingTimer.current = setTimeout(tick, 40);
      }
    };
    typingTimer.current = setTimeout(tick, 40);
  }, []);

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createHabit.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        frequency,
      },
      {
        onSuccess: () => {
          toast.success("Habit created");
          router.back();
        },
        onError: () => toast.error("Failed to create habit"),
      }
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.elevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        {/* Handle indicator */}
        <View
          style={{
            alignSelf: "center",
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#404040",
            marginTop: 10,
            marginBottom: 6,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.text.primary,
            }}
          >
            New Habit
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: colors.accent.indigo,
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Title
          </Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Read for 30 minutes"
            autoFocus
            style={{ marginBottom: 20 }}
          />

          {/* Description */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Description
          </Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Optional details..."
            multiline
            numberOfLines={2}
            style={{
              textAlignVertical: "top",
              minHeight: 60,
              marginBottom: 20,
            }}
          />

          {/* Frequency */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Frequency
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <Chip
              label="Daily"
              selected={frequency === "daily"}
              color={colors.accent.indigo}
              onPress={() => setFrequency("daily")}
            />
            <Chip
              label="Weekly"
              selected={frequency === "weekly"}
              color={colors.accent.indigo}
              onPress={() => setFrequency("weekly")}
            />
          </View>

          {/* Quick picks */}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.text.secondary,
              marginBottom: 6,
            }}
          >
            Quick picks
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 28,
            }}
          >
            {quickPicks.map((pick) => (
              <Chip
                key={pick}
                label={pick}
                selected={title === pick}
                color={colors.accent.indigo}
                size="sm"
                onPress={() => typeTitle(pick)}
              />
            ))}
          </View>

          {/* Create button */}
          <Button
            onPress={handleCreate}
            loading={createHabit.isPending}
            size="lg"
          >
            Create Habit
          </Button>
          <Text
            style={{
              fontSize: 12,
              color: colors.xp.gold,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            +10 XP per day
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
