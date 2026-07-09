import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { Skeleton } from "~/components/ui/skeleton";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Inline, Stack, Surface } from "~/components/layout";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("flex min-h-32 items-center justify-center border-dashed p-6 text-center", className)}>
      <Stack gap="sm" className="items-center">
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        <Heading variant="panel">{title}</Heading>
        {description ? <Text variant="muted">{description}</Text> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </Stack>
    </Surface>
  );
}

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-24 items-center justify-center gap-2 text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <MetaText>{label}</MetaText>
    </div>
  );
}

export function FullscreenLoadingState({ label = "Loading" }: { label?: React.ReactNode }) {
  return <LoadingState className="h-screen bg-background text-foreground" label={label} />;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("border-[var(--tone-danger)]/30 p-4", className)}>
      <Inline align="start" gap="md">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tone-danger)]" />
        <Stack gap="xs">
          <Heading variant="panel">{title}</Heading>
          {description ? <Text variant="muted">{description}</Text> : null}
          {action ? <div className="pt-1">{action}</div> : null}
        </Stack>
      </Inline>
    </Surface>
  );
}

export { SegmentedControl };

export function FilterTabs<T extends string>(props: React.ComponentProps<typeof SegmentedControl<T>>) {
  return <SegmentedControl {...props} />;
}

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  icon?: React.ReactNode;
};

export const MetaChip = React.forwardRef<HTMLSpanElement, ChipProps>(({ className, icon, children, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-[var(--bg-soft)] px-2 py-0.5 text-[length:var(--type-meta-size)] font-[var(--type-meta-weight)] leading-[var(--type-meta-line)] text-muted-foreground",
      className
    )}
    {...props}
  >
    {icon}
    <span className="truncate">{children}</span>
  </span>
));
MetaChip.displayName = "MetaChip";

export const EntityChip = React.forwardRef<HTMLSpanElement, ChipProps>(({ className, icon, children, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-[var(--bg-elev)] px-2.5 py-1 text-[length:var(--type-label-size)] font-[var(--type-label-weight)] leading-[var(--type-label-line)] text-foreground",
      className
    )}
    {...props}
  >
    {icon}
    <span className="truncate">{children}</span>
  </span>
));
EntityChip.displayName = "EntityChip";

export function DetailTile({
  label,
  value,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("p-3", className)}>
      <Stack gap="xs">
        <Inline gap="xs" className="text-muted-foreground">
          {icon}
          <MetaText>{label}</MetaText>
        </Inline>
        <Text as="div" className="min-w-0 truncate">
          {value}
        </Text>
      </Stack>
    </Surface>
  );
}

export function StatCell({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("p-3", className)}>
      <Stack gap="xs">
        <Text as="div" className="text-[length:var(--type-title-size)] font-[var(--type-title-weight)] leading-[var(--type-title-line)]">
          {value}
        </Text>
        <MetaText>{label}</MetaText>
      </Stack>
    </Surface>
  );
}

export function ActionRail({ className, children, ...props }: DivProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", className)} {...props}>
      {children}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-full rounded-[var(--r-2)]", className)} />;
}

export function PatternButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}
