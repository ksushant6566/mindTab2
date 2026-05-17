import { TextInput, StyleSheet, type TextInputProps } from "react-native";
import { colors } from "~/styles/colors";
import { radii } from "~/styles/tokens";

type InputProps = TextInputProps & {
  className?: string;
};

export function Input({ className, style, ...props }: InputProps) {
  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor={colors.text.muted}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.bg.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
});
