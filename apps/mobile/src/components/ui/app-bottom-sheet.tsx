import { forwardRef, useCallback, type ReactNode } from "react";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { colors } from "~/styles/colors";
import * as Haptics from "expo-haptics";

type AppBottomSheetProps = {
  children: ReactNode;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  showBackdrop?: boolean;
};

export const AppBottomSheet = forwardRef<BottomSheet, AppBottomSheetProps>(
  ({ children, snapPoints = ["50%", "90%"], onClose, showBackdrop = true }, ref) => {
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      ),
      []
    );

    return (
      <BottomSheet
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{
          backgroundColor: colors.bg.elevated,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        handleIndicatorStyle={{
          backgroundColor: "#404040",
          width: 36,
          height: 4,
        }}
        {...(showBackdrop ? { backdropComponent: renderBackdrop } : {})}
        onChange={(index) => {
          if (index >= 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (index === -1) onClose?.();
        }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
          {children}
        </BottomSheetView>
      </BottomSheet>
    );
  }
);
