import { View, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "rounded-full px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        outline: "border border-border",
        success: "bg-emerald-900",
        warning: "bg-amber-900",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

const textVariants: Record<string, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  outline: "text-foreground",
  success: "text-emerald-200",
  warning: "text-amber-200",
};

type BadgeProps = VariantProps<typeof badgeVariants> & {
  children: string;
  className?: string;
};

export function Badge({ variant = "secondary", children, className = "" }: BadgeProps) {
  return (
    <View className={badgeVariants({ variant, className })}>
      <Text className={`text-xs font-medium ${textVariants[variant ?? "secondary"]}`}>
        {children}
      </Text>
    </View>
  );
}
