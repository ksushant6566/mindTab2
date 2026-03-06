import { View, type ViewProps } from "react-native";

type CardProps = ViewProps & {
  className?: string;
};

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <View
      className={`rounded-lg border border-border bg-card p-4 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
