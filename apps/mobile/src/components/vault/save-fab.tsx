import React, { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { toast } from "sonner-native";
import { api } from "~/lib/api-client";
import { getAccessToken } from "~/lib/auth";
import { colors } from "~/styles/colors";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export function SaveFAB() {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const queryClient = useQueryClient();

  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // ── Backdrop ──────────────────────────────────────────────────────────────

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // ── Open / close ──────────────────────────────────────────────────────────

  const openSheet = () => {
    bottomSheetRef.current?.present();
  };

  const closeSheet = () => {
    bottomSheetRef.current?.dismiss();
  };

  // ── Save URL ──────────────────────────────────────────────────────────────

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setUrlLoading(true);
    try {
      const { error } = await (api as any).POST("/saves", {
        body: { url: trimmed },
      });
      if (error) throw new Error("Failed to save URL");
      queryClient.invalidateQueries({ queryKey: ["saves"] });
      toast.success("Saved!");
      setUrlInput("");
      closeSheet();
    } catch {
      toast.error("Failed to save URL");
    } finally {
      setUrlLoading(false);
    }
  };

  // ── Save Image ────────────────────────────────────────────────────────────

  const handleSaveImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const fileName = asset.uri.split("/").pop() ?? "image.jpg";
    const type = asset.mimeType ?? "image/jpeg";

    const formData = new FormData();
    formData.append("image", {
      uri: asset.uri,
      name: fileName,
      type,
    } as any);

    try {
      const token = await getAccessToken();
      const response = await fetch(`${API_URL}/saves`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "X-Platform": "mobile",
        },
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["saves"] });
      toast.success("Image saved!");
      closeSheet();
    } catch {
      toast.error("Failed to save image");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* FAB button */}
      <Pressable style={styles.fab} onPress={openSheet}>
        <Plus size={24} color="#000000" strokeWidth={2.5} />
      </Pressable>

      {/* Bottom sheet */}
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={["55%", "80%"]}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.sheetContent}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            {/* ── Save URL section ── */}
            <Text style={styles.sectionLabel}>Save URL</Text>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="Paste article URL..."
              placeholderTextColor="#555555"
              style={styles.urlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSaveUrl}
            />
            <Pressable
              style={[styles.saveBtn, urlLoading && styles.saveBtnDisabled]}
              onPress={handleSaveUrl}
              disabled={urlLoading}
            >
              <Text style={styles.saveBtnText}>
                {urlLoading ? "Saving..." : "Save"}
              </Text>
            </Pressable>

            {/* ── Divider ── */}
            <View style={styles.divider} />

            {/* ── Save Image section ── */}
            <Text style={styles.sectionLabel}>Save Image</Text>
            <Pressable style={styles.galleryBtn} onPress={handleSaveImage}>
              <Text style={styles.galleryBtnText}>Choose from Gallery</Text>
            </Pressable>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 100,
  },
  // Bottom sheet
  sheetBg: {
    backgroundColor: "#0a0a0a",
  },
  sheetHandle: {
    backgroundColor: "#333333",
    width: 36,
    height: 4,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  // Section label
  sectionLabel: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    marginTop: 8,
  },
  // URL input
  urlInput: {
    backgroundColor: "#141414",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222222",
    color: "#fafafa",
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  // Save button
  saveBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: "600",
  },
  // Divider
  divider: {
    backgroundColor: "#1a1a1a",
    height: 1,
    marginVertical: 20,
  },
  // Gallery button
  galleryBtn: {
    backgroundColor: "#141414",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222222",
    paddingVertical: 14,
    alignItems: "center",
  },
  galleryBtnText: {
    color: "#fafafa",
    fontSize: 14,
    fontWeight: "500",
  },
});
