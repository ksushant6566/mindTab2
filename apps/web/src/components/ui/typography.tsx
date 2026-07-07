import * as React from "react";
import { cn } from "~/lib/utils";

type TextVariant = "body" | "muted" | "subtle" | "danger";
type HeadingVariant = "page" | "section" | "panel";

const textVariants: Record<TextVariant, string> = {
  body: "text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-foreground",
  muted: "text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-muted-foreground",
  subtle: "text-[length:var(--type-label-size)] font-[var(--type-label-weight)] leading-[var(--type-label-line)] text-muted-foreground/70",
  danger: "text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-[var(--tone-danger)]",
};

const headingVariants: Record<HeadingVariant, string> = {
  page: "text-[length:var(--type-title-size)] font-[var(--type-title-weight)] leading-[var(--type-title-line)] text-foreground",
  section: "text-[length:var(--type-label-size)] font-[var(--type-label-weight)] leading-[var(--type-label-line)] text-foreground",
  panel: "text-[length:var(--type-label-size)] font-[var(--type-label-weight)] leading-[var(--type-label-line)] text-foreground",
};

type PolymorphicProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

type TextProps<T extends React.ElementType = "p"> = PolymorphicProps<T> & {
  variant?: TextVariant;
};

type HeadingProps<T extends React.ElementType = "h2"> = PolymorphicProps<T> & {
  variant?: HeadingVariant;
};

export function Text<T extends React.ElementType = "p">({
  as,
  variant = "body",
  className,
  children,
  ...props
}: TextProps<T>) {
  const Component = as || "p";
  return (
    <Component className={cn(textVariants[variant], className)} {...props}>
      {children}
    </Component>
  );
}

export function Heading<T extends React.ElementType = "h2">({
  as,
  variant = "section",
  className,
  children,
  ...props
}: HeadingProps<T>) {
  const Component = as || "h2";
  return (
    <Component className={cn(headingVariants[variant], className)} {...props}>
      {children}
    </Component>
  );
}

export function MetaText<T extends React.ElementType = "span">({
  as,
  className,
  children,
  ...props
}: PolymorphicProps<T>) {
  const Component = as || "span";
  return (
    <Component
      className={cn(
        "text-[length:var(--type-meta-size)] font-[var(--type-meta-weight)] leading-[var(--type-meta-line)] text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CodeText<T extends React.ElementType = "code">({
  as,
  className,
  children,
  ...props
}: PolymorphicProps<T>) {
  const Component = as || "code";
  return (
    <Component
      className={cn(
        "font-mono text-[length:var(--type-code-size)] font-[var(--type-code-weight)] leading-[var(--type-code-line)] text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
