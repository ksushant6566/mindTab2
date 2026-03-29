import React, { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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
import { api, authedFetch } from "~/lib/api-client";
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
      const response = await authedFetch(`${API_URL}/saves`, {
        method: "POST",
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
        <Plus size={24} color={colors.black} strokeWidth={2.5} />
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
            behavior="padding"
            style={{ flex: 1 }}
          >
            {/* ── Save URL section ── */}
            <Text style={styles.sectionLabel}>Save URL</Text>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="Paste article URL..."
              placeholderTextColor={colors.text.dim}
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
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.black,
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
    backgroundColor: colors.bg.input,
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
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 12,
    marginTop: 8,
  },
  // URL input
  urlInput: {
    backgroundColor: "#141414",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.input,
    color: "#fafafa",
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  // Save button
  saveBtn: {
    backgroundColor: colors.white,
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
    borderColor: colors.border.input,
    paddingVertical: 14,
    alignItems: "center",
  },
  galleryBtnText: {
    color: "#fafafa",
    fontSize: 14,
    fontWeight: "500",
  },
});
