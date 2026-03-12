import { TextInput, StyleSheet, type TextInputProps } from "react-native";
import { colors } from "~/styles/colors";

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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
});
