import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { CodeText, Heading, MetaText, Text } from "~/components/ui/typography";
import { Panel, ScrollPanel, Stack, Surface } from "~/components/layout";
import { SidebarItem } from "~/components/domain/navigation";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function SettingsShell({ className, ...props }: DivProps) {
  return <div className={cn("grid min-h-screen w-full grid-cols-[280px_minmax(0,1fr)] bg-background text-foreground", className)} {...props} />;
}

export function SettingsSidebar({ className, ...props }: DivProps) {
  return (
    <aside
      className={cn("flex min-h-0 flex-col border-r border-border bg-[var(--bg-soft)] px-3 py-4", className)}
      {...props}
    />
  );
}

export function SettingsPanel({ className, ...props }: DivProps) {
  return <main className={cn("min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-8 py-10", className)} {...props} />;
}

export function SettingsCard({ className, ...props }: DivProps) {
  return <Panel padding="none" variant="elevated" className={cn("overflow-hidden", className)} {...props} />;
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Stack gap="md" className={className}>
      {title || description ? (
        <Stack gap="xs">
          {title ? <Heading variant="section">{title}</Heading> : null}
          {description ? <Text variant="muted">{description}</Text> : null}
        </Stack>
      ) : null}
      {children}
    </Stack>
  );
}

export function SettingsRow({
  label,
  description,
  control,
  icon,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-border px-4 py-3 last:border-b-0", className)}>
      <Stack gap="xs" className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
          <Label className="truncate text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-foreground">
            {label}
          </Label>
        </div>
        {description ? <MetaText>{description}</MetaText> : null}
      </Stack>
      <div className="shrink-0">{control ?? children}</div>
    </div>
  );
}

export function ColorControl({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex h-9 w-[160px] cursor-pointer items-center gap-2 rounded-[var(--r-3)] border border-border bg-background px-2", className)}>
      <span className="size-5 rounded-full border border-border" style={{ backgroundColor: value }} aria-hidden="true" />
      <CodeText className="text-foreground">{value}</CodeText>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange?.(event.target.value.toUpperCase())}
        className="sr-only"
      />
    </label>
  );
}

export function RangeControl({
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
  onChange,
  disabled,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange?: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-[250px] items-center gap-3", disabled && "opacity-45", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(Number(event.target.value))}
        className="h-1 flex-1 accent-primary"
      />
      <CodeText className="w-10 text-right text-foreground">{value}{suffix}</CodeText>
    </div>
  );
}

export function PresetCard({
  title,
  description,
  selected,
  preview,
  onSelect,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  selected?: boolean;
  preview?: React.ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group min-w-0 rounded-[var(--r-3)] border border-border bg-card p-3 text-left transition-colors hover:border-[var(--border-2)] hover:bg-[var(--bg-hover)]",
        selected && "border-primary ring-1 ring-primary",
        className
      )}
    >
      <Stack gap="sm">
        {preview ? <Surface variant="soft" className="aspect-[4/3] overflow-hidden">{preview}</Surface> : null}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Stack gap="xs" className="min-w-0">
            <Heading as="div" variant="panel" className="truncate">{title}</Heading>
            {description ? <MetaText className="line-clamp-2">{description}</MetaText> : null}
          </Stack>
          {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
        </div>
      </Stack>
    </button>
  );
}

export function SettingsNavItem({
  active,
  icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <SidebarItem active={active} icon={icon} className={className} {...props}>
      {children}
    </SidebarItem>
  );
}

export function SettingsScrollArea({ className, ...props }: DivProps) {
  return <ScrollPanel className={cn("flex-1 pr-1", className)} {...props} />;
}

export function SettingsBackButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" size="sm" {...props} />;
}
