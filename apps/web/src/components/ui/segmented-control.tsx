import * as React from "react";
import { cn } from "~/lib/utils";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onValueChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
  "aria-label"?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-secondary/55 p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex h-7 min-w-0 items-center justify-center rounded-[var(--r-1)] px-3 text-[length:var(--type-meta-size)] font-[var(--type-meta-weight)] leading-[var(--type-meta-line)] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
              active && "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground",
              itemClassName
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
