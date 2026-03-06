import { Pressable, Text, ActivityIndicator, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        ghost: "",
        outline: "border border-border",
      },
      size: {
        default: "px-4 py-2.5",
        sm: "px-3 py-1.5",
        lg: "px-6 py-3",
        icon: "p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const textVariants: Record<string, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  ghost: "text-foreground",
  outline: "text-foreground",
};

type ButtonProps = PressableProps & VariantProps<typeof buttonVariants> & {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function Button({ variant = "default", size, loading, children, className, ...props }: ButtonProps) {
  return (
    <Pressable
      className={buttonVariants({ variant, size, className })}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "default" ? "#0a0a0a" : "#fafafa"} />
      ) : typeof children === "string" ? (
        <Text className={`font-medium text-sm ${textVariants[variant ?? "default"]}`}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
