import type { ReactNode } from "react";
import { Flag, Zap } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  getImpactTone,
  getPriorityTone,
  getStatusTone,
  type ImpactValue,
  type PriorityValue,
  type StatusValue,
} from "~/lib/tones";

export function ToneBadge({
  label,
  tone,
  icon,
  className,
}: {
  label: string;
  tone: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[length:var(--type-meta-size)] font-[var(--type-meta-weight)] leading-[var(--type-meta-line)]",
        className
      )}
      style={{ color: tone }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority?: string | null; className?: string }) {
  const meta = getPriorityTone(priority as PriorityValue);
  return (
    <ToneBadge
      label={meta.label}
      tone={meta.tone}
      className={className}
      icon={<Flag className="h-3 w-3 shrink-0" fill="currentColor" />}
    />
  );
}

export function ImpactBadge({ impact, className }: { impact?: string | null; className?: string }) {
  const meta = getImpactTone(impact as ImpactValue);
  return (
    <ToneBadge
      label={meta.label}
      tone={meta.tone}
      className={className}
      icon={
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {Array.from({ length: meta.dots }).map((_, index) => (
            <Zap key={index} className="h-3 w-3" fill="currentColor" />
          ))}
        </span>
      }
    />
  );
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const meta = getStatusTone(status as StatusValue);
  return (
    <ToneBadge
      label={meta.label}
      tone={meta.tone}
      className={className}
      icon={<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.tone }} />}
    />
  );
}
