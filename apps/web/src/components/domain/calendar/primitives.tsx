import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Inline, Stack, Surface } from "~/components/layout";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function CalendarToolbar({
  title,
  actions,
  onPrevious,
  onNext,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-10 items-center justify-between gap-3", className)}>
      <Inline gap="xs">
        {onPrevious ? (
          <Button type="button" variant="ghost" size="icon" onClick={onPrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <Heading variant="section">{title}</Heading>
        {onNext ? (
          <Button type="button" variant="ghost" size="icon" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </Inline>
      {actions}
    </div>
  );
}

export function CalendarEventChip({
  title,
  time,
  tone,
  completed,
  className,
  children,
  ...props
}: DivProps & {
  title: React.ReactNode;
  time?: React.ReactNode;
  tone?: string;
  completed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-[var(--r-1)] border border-border bg-[var(--bg-soft)] px-2 py-1 text-[length:var(--type-meta-size)] font-[var(--type-meta-weight)] leading-[var(--type-meta-line)] text-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone || "var(--muted-foreground)" }} />
          <span className={cn("truncate", completed && "line-through decoration-muted-foreground/70")}>{title}</span>
          {time ? <MetaText className="ml-auto shrink-0">{time}</MetaText> : null}
        </>
      )}
    </div>
  );
}

export function CalendarTimedEvent(props: React.ComponentProps<typeof CalendarEventChip>) {
  return <CalendarEventChip className={cn("border-primary/20 bg-primary/10", props.className)} {...props} />;
}

export function CalendarGridCell({ active, className, ...props }: DivProps & { active?: boolean }) {
  return (
    <div
      className={cn("min-h-24 border-b border-r border-border p-2", active && "bg-[var(--bg-soft)]", className)}
      {...props}
    />
  );
}

export function CalendarTimeGrid({ className, ...props }: DivProps) {
  return <div className={cn("grid min-h-0 grid-cols-[64px_minmax(0,1fr)] overflow-hidden", className)} {...props} />;
}

export function CalendarMonthGrid({ className, ...props }: DivProps) {
  return <div className={cn("grid min-h-0 grid-cols-7 overflow-hidden rounded-[var(--r-3)] border border-border", className)} {...props} />;
}

export function CalendarUnscheduledPanel({
  title = "Unscheduled",
  eyebrow,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("p-3", className)}>
      <Stack gap="sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {eyebrow ? <MetaText as="div" className="uppercase">{eyebrow}</MetaText> : null}
            <Heading as="div" variant="panel">{title}</Heading>
            {description ? <Text variant="subtle" className="mt-0.5">{description}</Text> : null}
          </div>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </div>
        {children}
      </Stack>
    </Surface>
  );
}

export function CalendarDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-[var(--bg-elev)] p-0 shadow-[var(--shadow-dialog)]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle asChild>
                <Heading as="h2" variant="section" className="truncate">{title}</Heading>
              </DialogTitle>
              {description ? (
                <DialogDescription asChild>
                  <Text variant="muted">{description}</Text>
                </DialogDescription>
              ) : null}
            </div>
            {actions}
          </div>
        </DialogHeader>
        <div className="custom-scrollbar max-h-[52vh] space-y-2 overflow-auto px-5 py-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarEmptyDay({ children = "No events", className }: { children?: React.ReactNode; className?: string }) {
  return <Text variant="subtle" className={cn("px-2 py-1", className)}>{children}</Text>;
}
