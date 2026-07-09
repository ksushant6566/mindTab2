import * as React from "react";
import { FileText, ImageIcon, Link2, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Inline, Stack, Surface } from "~/components/layout";
import { FilterTabs, MetaChip } from "~/components/patterns";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function VaultItemCard({
  title,
  summary,
  sourceType,
  state,
  media,
  selected,
  actions,
  className,
  ...props
}: DivProps & {
  title: React.ReactNode;
  summary?: React.ReactNode;
  sourceType?: React.ReactNode;
  state?: React.ReactNode;
  media?: React.ReactNode;
  selected?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <Surface variant="base" interactive className={cn("group min-w-0 p-3", selected && "border-primary ring-1 ring-primary", className)} {...props}>
      <Inline align="start" className="justify-between">
        <Inline align="start" gap="sm" className="min-w-0">
          {media ? (
            <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-2)] border border-border bg-secondary">
              {media}
            </div>
          ) : (
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Stack gap="xs" className="min-w-0">
            <Heading as="div" variant="panel" className="truncate">{title}</Heading>
            {summary ? <Text variant="muted" className="line-clamp-2">{summary}</Text> : null}
            <Inline gap="xs">
              {sourceType ? <MetaChip>{sourceType}</MetaChip> : null}
              {state ? <MetaChip>{state}</MetaChip> : null}
            </Inline>
          </Stack>
        </Inline>
        {actions}
      </Inline>
    </Surface>
  );
}

export function VaultFilterTabs<T extends string>(props: React.ComponentProps<typeof FilterTabs<T>>) {
  return <FilterTabs {...props} />;
}

export function VaultDetailSection({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Surface variant="base" className={cn("p-4", className)}>
      <Stack gap="md">
        <Heading variant="section">{title}</Heading>
        {children}
      </Stack>
    </Surface>
  );
}

export function VaultMediaPreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Surface variant="soft" className={cn("flex min-h-40 items-center justify-center overflow-hidden p-3", className)}>{children}</Surface>;
}

export function VaultDeleteButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon" {...props}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export const VaultIcons = { FileText, ImageIcon, Link2 };
