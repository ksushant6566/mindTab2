import * as React from "react";
import { Check } from "lucide-react";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { CodeText, Heading, MetaText, Text } from "~/components/ui/typography";
import { Panel, ScrollPanel, Stack, Surface } from "~/components/layout";
import { SidebarItem, SidebarShell } from "~/components/domain/navigation";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function SettingsShell({ className, ...props }: DivProps) {
  return <div className={cn("grid min-h-screen w-full grid-cols-[280px_minmax(0,1fr)] bg-background text-foreground", className)} {...props} />;
}

export function SettingsSidebar({ className, ...props }: DivProps) {
  return (
    <SidebarShell
      className={cn("min-h-screen px-3 py-4", className)}
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
  gap = "md",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  gap?: React.ComponentProps<typeof Stack>["gap"];
}) {
  return (
    <Stack gap={gap} className={className}>
      {title || description ? (
        <Stack gap="xs">
          {title ? <Heading variant="page">{title}</Heading> : null}
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
    <div className={cn("grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b-[0.75px] border-border px-4 py-2 last:border-b-0", className)}>
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
  const foreground = getReadableControlText(value);

  return (
    <label
      className={cn("flex h-9 w-[160px] cursor-pointer items-center gap-2 rounded-[var(--r-3)] border border-border px-2", className)}
      style={{ backgroundColor: value }}
    >
      <span className="size-5 rounded-full border border-current opacity-50" aria-hidden="true" style={{ color: foreground }} />
      <CodeText style={{ color: foreground }}>{value}</CodeText>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange?.(event.target.value.toUpperCase())}
        className="sr-only"
      />
    </label>
  );
}

function getReadableControlText(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "111111";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111111" : "#FFFFFF";
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
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(nextValue) => onChange?.(nextValue[0] ?? value)}
        className="flex-1"
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

export function SettingsBackButton({
  icon,
  children,
  ...props
}: React.ComponentProps<typeof SidebarItem> & {
  icon?: React.ReactNode;
}) {
  return (
    <SidebarItem icon={icon} {...props}>
      {children}
    </SidebarItem>
  );
}
