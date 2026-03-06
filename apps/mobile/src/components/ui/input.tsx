import { TextInput, type TextInputProps } from "react-native";
import { colors } from "~/styles/colors";

type InputProps = TextInputProps & {
  className?: string;
};

export function Input({ className = "", ...props }: InputProps) {
  return (
    <TextInput
      className={`rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground ${className}`}
      placeholderTextColor={colors.mutedForeground}
      {...props}
    />
  );
}
